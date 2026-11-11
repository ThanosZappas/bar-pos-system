package gr.barlab.negroni.shift

import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.MetadataChanges
import com.google.firebase.firestore.SetOptions
import com.google.firebase.firestore.snapshots
import com.google.firebase.Timestamp
import gr.barlab.negroni.auth.Rights
import gr.barlab.negroni.auth.Role
import gr.barlab.negroni.auth.ShiftClock
import gr.barlab.negroni.auth.StaffUser
import java.util.Date
import kotlinx.coroutines.flow.Flow
import gr.barlab.negroni.data.keepAlive
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map

/**
 * Permission to work, one document per server. The server asks; the barman or admin approves until
 * the next 18:00, denies, or revokes, and may approve without being asked. The Firestore rules
 * enforce who may write what. Writes are queued offline like everything else.
 */
class ShiftRepository(private val db: FirebaseFirestore) {

    fun myShift(uid: String): Flow<Shift?> =
        db.document("shifts/$uid").snapshots(MetadataChanges.INCLUDE)
            .map { if (it.exists()) it.toShift() else null }
            .keepAlive()

    /** For barman/admin: requests waiting for an answer in the current shift, oldest first. */
    fun pendingRequests(): Flow<List<Shift>> =
        db.collection(SHIFTS).whereEqualTo("status", Shift.Status.Requested.wire).snapshots()
            .map { snap ->
                val today = ShiftClock.key(System.currentTimeMillis())
                snap.documents.map { it.toShift() }.filter { it.shiftDay == today }.sortedBy { it.requestedAtMs ?: 0 }
            }
            .keepAlive()

    /** For barman/admin: every active server with their permission for this shift. */
    fun staff(lead: StaffUser): Flow<List<Pair<StaffUser, Shift?>>> {
        if (!lead.isLead) return flowOf(emptyList())
        val servers = db.collection("users").whereEqualTo("role", Role.Server.wire).snapshots().map { snap ->
            snap.documents.filter { it.getBoolean("active") == true }.map {
                StaffUser(
                    uid = it.id,
                    username = it.getString("username").orEmpty(),
                    displayName = it.getString("displayName").orEmpty(),
                    role = Role.Server,
                    mustChangePassword = it.getBoolean("mustChangePassword") != false,
                    rights = Rights.from(it.get("rights") as? Map<*, *>),
                )
            }.sortedBy { it.displayName }
        }
        val shifts = db.collection(SHIFTS).snapshots().map { snap -> snap.documents.associate { it.id to it.toShift() } }
        return kotlinx.coroutines.flow.combine(servers, shifts) { users, byUid -> users.map { it to byUid[it.uid] } }
            .keepAlive()
    }

    /**
     * The server asks to start (or once more after a first "Not now"). Merged, so the denial count
     * and any block, which only the barman writes, stay as they are; the rules refuse a request
     * while one is waiting or while blocked.
     */
    fun request(me: StaffUser) {
        db.document("shifts/${me.uid}").set(
            mapOf(
                "uid" to me.uid,
                "displayName" to me.displayName,
                "shiftDay" to ShiftClock.key(System.currentTimeMillis()),
                "status" to Shift.Status.Requested.wire,
                "requestedAt" to FieldValue.serverTimestamp(),
            ),
            SetOptions.merge(),
        )
    }

    /** Barman/admin: allowed until the next 18:00 (also without a request); clears any denials. */
    fun approve(lead: StaffUser, serverUid: String, serverName: String) {
        decide(lead, serverUid, serverName, Shift.Status.Approved, mapOf("approvedUntil" to Timestamp(Date(ShiftClock.end(System.currentTimeMillis()))), "denials" to 0))
    }

    /** "Not now". The second in a row this shift blocks further requests until 18:00. */
    fun deny(lead: StaffUser, current: Shift?, serverUid: String, serverName: String) {
        val now = System.currentTimeMillis()
        val denial = ShiftClock.afterDenial(current?.denials ?: 0, current?.lastDeniedAtMs, now)
        val extra = mutableMapOf<String, Any>("denials" to denial.denials, "lastDeniedAt" to FieldValue.serverTimestamp())
        denial.blockedUntilMs?.let { extra["blockedUntil"] = Timestamp(Date(it)) }
        decide(lead, serverUid, serverName, Shift.Status.Denied, extra)
    }

    /** Take permission back. The denial count is kept (it is not a denial and not a reset). */
    fun revoke(lead: StaffUser, current: Shift?, serverUid: String, serverName: String) {
        val keep = mutableMapOf<String, Any>("denials" to (current?.denials ?: 0))
        current?.lastDeniedAtMs?.let { keep["lastDeniedAt"] = Timestamp(Date(it)) }
        current?.blockedUntilMs?.let { keep["blockedUntil"] = Timestamp(Date(it)) }
        decide(lead, serverUid, serverName, Shift.Status.Revoked, keep)
    }

    /** Lift a block: the server may ask again. */
    fun clearBlock(lead: StaffUser, serverUid: String, serverName: String) {
        decide(lead, serverUid, serverName, Shift.Status.Cleared, mapOf("denials" to 0))
    }

    /** Barman/admin decisions replace the document (the rules check every field). */
    private fun decide(lead: StaffUser, serverUid: String, serverName: String, status: Shift.Status, extra: Map<String, Any>) {
        val data = mutableMapOf<String, Any>(
            "uid" to serverUid,
            "displayName" to serverName,
            "shiftDay" to ShiftClock.key(System.currentTimeMillis()),
            "status" to status.wire,
            "decidedAt" to FieldValue.serverTimestamp(),
            "decidedBy" to lead.uid,
            "decidedByName" to lead.displayName,
        )
        data.putAll(extra)
        db.document("shifts/$serverUid").set(data)
    }

    private fun DocumentSnapshot.toShift() = Shift(
        uid = id,
        displayName = getString("displayName").orEmpty(),
        shiftDay = getString("shiftDay").orEmpty(),
        status = Shift.Status.fromWire(getString("status")) ?: Shift.Status.Revoked,
        requestedAtMs = getTimestamp("requestedAt", DocumentSnapshot.ServerTimestampBehavior.ESTIMATE)?.toDate()?.time,
        decidedByName = getString("decidedByName"),
        approvedUntilMs = getTimestamp("approvedUntil")?.toDate()?.time,
        pendingSync = metadata.hasPendingWrites(),
        denials = getLong("denials")?.toInt() ?: 0,
        lastDeniedAtMs = getTimestamp("lastDeniedAt", DocumentSnapshot.ServerTimestampBehavior.ESTIMATE)?.toDate()?.time,
        blockedUntilMs = getTimestamp("blockedUntil")?.toDate()?.time,
    )

    private companion object {
        const val SHIFTS = "shifts"
    }
}
