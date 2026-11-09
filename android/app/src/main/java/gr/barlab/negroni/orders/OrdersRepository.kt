package gr.barlab.negroni.orders

import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.MetadataChanges
import com.google.firebase.firestore.WriteBatch
import com.google.firebase.firestore.snapshots
import gr.barlab.negroni.auth.StaffUser
import gr.barlab.negroni.catalog.DiningTable
import gr.barlab.negroni.domain.LineChange
import gr.barlab.negroni.domain.OrderDraft
import gr.barlab.negroni.domain.OrderLine
import gr.barlab.negroni.domain.Payment
import gr.barlab.negroni.domain.PaymentMethod
import gr.barlab.negroni.domain.Payments
import gr.barlab.negroni.domain.Round
import gr.barlab.negroni.domain.RoundEdits
import gr.barlab.negroni.domain.RoundStatus
import gr.barlab.negroni.domain.TableState
import gr.barlab.negroni.domain.TableStatus
import gr.barlab.negroni.domain.summaryLines
import gr.barlab.negroni.pos.PosGateway
import gr.barlab.negroni.pos.Receipt
import gr.barlab.negroni.sync.SyncMonitor
import java.util.UUID
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map

/**
 * Rounds (orders) in Firestore.
 *
 * Offline safety: every id is generated here, every write is a batch (round + its event) that
 * Firestore queues locally and sends when the network returns. Nothing waits for the server, so
 * the UI never blocks while offline, and a retried write targets the same document, never a copy.
 * If the server refuses a queued write after reconnecting (e.g. the round was already served),
 * it is reported on [writeFailures].
 */
class OrdersRepository(
    private val db: FirebaseFirestore,
    private val pos: PosGateway,
    private val sync: SyncMonitor? = null,
) {

    data class WriteFailure(val action: Action, val tableName: String)
    enum class Action { Submit, Edit, Serve, Cancel, Pay, Reverse, Close }

    private val _writeFailures = MutableSharedFlow<WriteFailure>(extraBufferCapacity = 8, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val writeFailures: SharedFlow<WriteFailure> = _writeFailures

    /** Live rounds of the given sessions (the tables' current sessions), oldest first. */
    fun roundsForSessions(sessionIds: Collection<String>): Flow<List<Round>> {
        val ids = sessionIds.filter { it.isNotEmpty() }.distinct()
        if (ids.isEmpty()) return flowOf(emptyList())
        // whereIn takes at most 30 values per query.
        val flows = ids.chunked(30).map { chunk ->
            db.collection(ROUNDS).whereIn("sessionId", chunk)
                .snapshots(MetadataChanges.INCLUDE)
                .map { snap -> snap.documents.map { it.toRound() } }
                .catch { emit(emptyList()) }
        }
        return combine(flows) { parts -> parts.flatMap { it }.sortedBy { it.createdAtMs } }
    }

    /**
     * The bar's to-do list, oldest first: Preparing rounds plus unacknowledged cancellations.
     * Two single-field queries, so Firestore needs no composite index.
     */
    fun boardRounds(): Flow<List<Round>> = combine(
        db.collection(ROUNDS).whereEqualTo("status", RoundStatus.Preparing.wire).snapshots(MetadataChanges.INCLUDE)
            .map { snap -> snap.documents.map { it.toRound() } }.catch { emit(emptyList()) },
        db.collection(ROUNDS).whereEqualTo("editSeen", false).snapshots(MetadataChanges.INCLUDE)
            .map { snap -> snap.documents.map { it.toRound() } }.catch { emit(emptyList()) },
    ) { preparing, unseen -> (preparing + unseen).associateBy { it.id }.values.filter { it.isOnBoard }.sortedBy { it.createdAtMs } }

    /** Barman/admin has seen the round and its latest change: clears the highlight (rules allow only those roles). */
    fun open(round: Round, user: StaffUser) {
        val task = db.collection(ROUNDS).document(round.id).update(
            mapOf(
                "openedAt" to FieldValue.serverTimestamp(),
                "openedBy" to user.uid,
                "editSeen" to true,
                "updatedAt" to FieldValue.serverTimestamp(),
                "updatedBy" to user.uid,
            ),
        )
        sync?.track(task)
    }

    /** Live payments of the given sessions, oldest first. */
    fun paymentsForSessions(sessionIds: Collection<String>): Flow<List<Payment>> {
        val ids = sessionIds.filter { it.isNotEmpty() }.distinct()
        if (ids.isEmpty()) return flowOf(emptyList())
        val flows = ids.chunked(30).map { chunk ->
            db.collection(PAYMENTS).whereIn("sessionId", chunk)
                .snapshots(MetadataChanges.INCLUDE)
                .map { snap -> snap.documents.map { it.toPayment() } }
                .catch { emit(emptyList()) }
        }
        return combine(flows) { parts -> parts.flatMap { it }.sortedBy { it.createdAtMs } }
    }

    fun tableStates(tables: List<DiningTable>): Flow<Map<String, TableState>> {
        val sessions = tables.map { it.currentSessionId }
        return combine(roundsForSessions(sessions), paymentsForSessions(sessions)) { rounds, payments ->
            val roundsBySession = rounds.groupBy { it.sessionId }
            val paidBySession = payments.groupBy { it.sessionId }.mapValues { Payments.paidCents(it.value) }
            tables.associate { it.id to TableState.derive(roundsBySession[it.currentSessionId].orEmpty(), paidBySession[it.currentSessionId] ?: 0) }
        }
    }

    /** Records a payment for the table's current session. Queued offline like every other write. */
    fun addPayment(table: DiningTable, amountCents: Long, method: PaymentMethod, user: StaffUser) {
        if (amountCents <= 0) return
        write(Action.Pay, table.name) {
            set(db.collection(PAYMENTS).document(newId()), paymentData(table.id, table.name, table.currentSessionId, amountCents, method, user))
        }
    }

    /** Full reversal of a mistaken payment. Its id derives from the original, so it can happen only once. */
    fun reverse(payment: Payment, reason: String, user: StaffUser) {
        val data = paymentData(payment.tableId, payment.tableName, payment.sessionId, -payment.amountCents, payment.method, user).toMutableMap()
        data["reversalOf"] = payment.id
        data["reason"] = reason.trim().take(200)
        write(Action.Reverse, payment.tableName) { set(db.collection(PAYMENTS).document(Payments.reversalId(payment.id)), data) }
    }

    /**
     * Closes a fully paid table: records the session and gives the table a fresh session id in one
     * batch (the rules check both halves), so the table returns to Free.
     */
    fun close(table: DiningTable, rounds: List<Round>, payments: List<Payment>, user: StaffUser) {
        val paid = Payments.paidCents(payments)
        val state = TableState.derive(rounds, paid)
        // Another phone may have reversed a payment a moment ago: refuse quietly, never crash.
        if (state.status != TableStatus.Paid) {
            _writeFailures.tryEmit(WriteFailure(Action.Close, table.name))
            return
        }
        write(Action.Close, table.name) {
            set(
                db.collection("sessions").document(table.currentSessionId),
                mapOf(
                    "tableId" to table.id, "tableName" to table.name,
                    "closedAt" to FieldValue.serverTimestamp(), "closedBy" to user.uid, "closedByName" to user.displayName,
                    "totalCents" to state.totalCents, "paidCents" to paid, "roundCount" to state.roundCount,
                ),
            )
            update(
                db.collection("tables").document(table.id),
                mapOf("currentSessionId" to newId(), "updatedAt" to FieldValue.serverTimestamp(), "updatedBy" to user.uid),
            )
        }
        pos.sendReceipt(
            Receipt(table.id, table.name, table.currentSessionId, summaryLines(rounds), state.totalCents, payments, System.currentTimeMillis(), user.displayName),
        )
    }

    private fun paymentData(tableId: String, tableName: String, sessionId: String, amountCents: Long, method: PaymentMethod, user: StaffUser) = mapOf(
        "tableId" to tableId, "tableName" to tableName, "sessionId" to sessionId,
        "amountCents" to amountCents, "method" to method.wire,
        "createdAt" to FieldValue.serverTimestamp(), "createdBy" to user.uid, "createdByName" to user.displayName,
        "clientCreatedAt" to Timestamp.now(),
    )

    /** Creates a round in the table's current session. Returns its id at once, also offline (null for an empty draft). */
    fun submit(table: DiningTable, user: StaffUser, draft: OrderDraft): String? {
        if (draft.isEmpty) return null
        val roundId = newId()
        val eventId = newId()
        val round = mapOf(
            "tableId" to table.id,
            "tableName" to table.name,
            "sessionId" to table.currentSessionId,
            "status" to RoundStatus.Preparing.wire,
            "items" to draft.lines.map { it.toMap() },
            "note" to draft.note.trim(),
            "createdAt" to FieldValue.serverTimestamp(),
            "createdBy" to user.uid,
            "createdByName" to user.displayName,
            "clientCreatedAt" to Timestamp.now(),
            "updatedAt" to FieldValue.serverTimestamp(),
            "updatedBy" to user.uid,
            "editCount" to 0,
            "editSeen" to true,
            "lastEventId" to eventId,
        )
        write(Action.Submit, table.name) {
            set(db.collection(ROUNDS).document(roundId), round)
            set(event(roundId, eventId), eventData("created", user))
        }
        pos.sendOrder(
            Round(roundId, table.id, table.name, table.currentSessionId, RoundStatus.Preparing, draft.lines, draft.note.trim(), System.currentTimeMillis(), user.displayName),
        )
        return roundId
    }

    /** Saves changed quantities, notes and cancelled lines. No-op when nothing changed. */
    fun edit(round: Round, lines: List<OrderLine>, note: String, user: StaffUser) {
        // The screen may show a round another phone just served; the rules refuse it anyway.
        if (!round.isEditable) return
        val changes = RoundEdits.diff(round.lines, lines)
        val noteChanged = note.trim() != round.note
        if (changes.isEmpty() && !noteChanged) return
        val eventId = newId()
        write(Action.Edit, round.tableName) {
            update(
                db.collection(ROUNDS).document(round.id),
                mapOf(
                    "items" to lines.map { it.toMap() },
                    "note" to note.trim(),
                    "editCount" to FieldValue.increment(1),
                    "editSeen" to false,
                    "lastEditAt" to FieldValue.serverTimestamp(),
                    "lastEditBy" to user.uid,
                    "lastEditByName" to user.displayName,
                    "updatedAt" to FieldValue.serverTimestamp(),
                    "updatedBy" to user.uid,
                    "lastEventId" to eventId,
                ),
            )
            val data = eventData("edited", user).toMutableMap()
            data["changes"] = changes.map { it.toMap() }
            if (noteChanged) data["note"] = note.trim()
            set(event(round.id, eventId), data)
        }
    }

    fun serve(round: Round, user: StaffUser) {
        if (!round.isEditable) return
        val eventId = newId()
        write(Action.Serve, round.tableName) {
            update(
                db.collection(ROUNDS).document(round.id),
                mapOf(
                    "status" to RoundStatus.Served.wire,
                    "servedAt" to FieldValue.serverTimestamp(),
                    "servedBy" to user.uid,
                    "servedByName" to user.displayName,
                    "updatedAt" to FieldValue.serverTimestamp(),
                    "updatedBy" to user.uid,
                    "lastEventId" to eventId,
                ),
            )
            set(event(round.id, eventId), eventData("served", user))
        }
    }

    fun cancel(round: Round, user: StaffUser) {
        if (!round.isEditable) return
        val eventId = newId()
        write(Action.Cancel, round.tableName) {
            update(
                db.collection(ROUNDS).document(round.id),
                mapOf(
                    "status" to RoundStatus.Cancelled.wire,
                    "cancelledAt" to FieldValue.serverTimestamp(),
                    "cancelledBy" to user.uid,
                    "cancelledByName" to user.displayName,
                    "editSeen" to false,
                    "updatedAt" to FieldValue.serverTimestamp(),
                    "updatedBy" to user.uid,
                    "lastEventId" to eventId,
                ),
            )
            set(event(round.id, eventId), eventData("cancelled", user))
        }
    }

    private fun write(action: Action, tableName: String, build: WriteBatch.() -> Unit) {
        val task = db.batch().apply(build).commit()
        task.addOnFailureListener { _writeFailures.tryEmit(WriteFailure(action, tableName)) }
        sync?.track(task)
    }

    private fun event(roundId: String, eventId: String) = db.collection(ROUNDS).document(roundId).collection("events").document(eventId)

    private fun eventData(type: String, user: StaffUser) =
        mapOf("type" to type, "at" to FieldValue.serverTimestamp(), "by" to user.uid, "byName" to user.displayName)

    private fun newId() = UUID.randomUUID().toString()

    companion object {
        const val ROUNDS = "rounds"
        const val PAYMENTS = "payments"

        internal fun DocumentSnapshot.toPayment(): Payment = Payment(
            id = id,
            tableId = getString("tableId").orEmpty(),
            tableName = getString("tableName").orEmpty(),
            sessionId = getString("sessionId").orEmpty(),
            amountCents = getLong("amountCents") ?: 0L,
            method = PaymentMethod.fromWire(getString("method")),
            reversalOf = getString("reversalOf"),
            reason = getString("reason"),
            createdAtMs = millis("clientCreatedAt") ?: millis("createdAt") ?: 0L,
            createdByName = getString("createdByName").orEmpty(),
            pendingSync = metadata.hasPendingWrites(),
        )

        private fun OrderLine.toMap() = mapOf(
            "lineId" to lineId, "itemId" to itemId, "name" to name, "priceCents" to priceCents,
            "qty" to qty, "note" to note, "cancelled" to cancelled,
        )

        private fun LineChange.toMap() = mapOf(
            "lineId" to lineId, "name" to name, "qtyFrom" to qtyFrom, "qtyTo" to qtyTo,
            "noteFrom" to noteFrom, "noteTo" to noteTo, "cancelled" to cancelled,
        )

        private fun DocumentSnapshot.millis(field: String): Long? =
            getTimestamp(field, DocumentSnapshot.ServerTimestampBehavior.ESTIMATE)?.toDate()?.time

        internal fun DocumentSnapshot.toRound(): Round = Round(
            id = id,
            tableId = getString("tableId").orEmpty(),
            tableName = getString("tableName").orEmpty(),
            sessionId = getString("sessionId").orEmpty(),
            status = RoundStatus.fromWire(getString("status")),
            lines = (get("items") as? List<*>).orEmpty().mapNotNull { (it as? Map<*, *>)?.toLine() },
            note = getString("note").orEmpty(),
            // The phone's clock orders rounds made offline correctly; the server time is used when present.
            createdAtMs = millis("clientCreatedAt") ?: millis("createdAt") ?: 0L,
            createdByName = getString("createdByName").orEmpty(),
            openedAtMs = millis("openedAt"),
            servedAtMs = millis("servedAt"),
            servedByName = getString("servedByName"),
            editCount = getLong("editCount")?.toInt() ?: 0,
            editSeen = getBoolean("editSeen") != false,
            lastEditByName = getString("lastEditByName"),
            cancelledByName = getString("cancelledByName"),
            pendingSync = metadata.hasPendingWrites(),
        )

        private fun Map<*, *>.toLine(): OrderLine? {
            val lineId = this["lineId"] as? String ?: return null
            return OrderLine(
                lineId = lineId,
                itemId = this["itemId"] as? String ?: "",
                name = this["name"] as? String ?: "",
                priceCents = (this["priceCents"] as? Number)?.toLong() ?: 0L,
                qty = (this["qty"] as? Number)?.toInt() ?: 0,
                note = this["note"] as? String ?: "",
                cancelled = this["cancelled"] as? Boolean ?: false,
            )
        }
    }
}
