package gr.barlab.negroni.shift

import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.MetadataChanges
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

    /** The server asks to start (or asks again after a denial). */
    fun request(me: StaffUser) {
        db.document("shifts/${me.uid}").set(
            mapOf(
                "uid" to me.uid,
                "displayName" to me.displayName,
                "shiftDay" to ShiftClock.key(System.currentTimeMillis()),
                "status" to Shift.Status.Requested.wire,
                "requestedAt" to FieldValue.serverTimestamp(),
            ),
        )
    }

    /** Barman/admin: approve until the next 18:00 (also without a request), deny, or revoke. */
    fun decide(lead: StaffUser, serverUid: String, serverName: String, status: Shift.Status) {
        val now = System.currentTimeMillis()
        val data = mutableMapOf<String, Any>(
            "uid" to serverUid,
            "displayName" to serverName,
            "shiftDay" to ShiftClock.key(now),
            "status" to status.wire,
            "decidedAt" to FieldValue.serverTimestamp(),
            "decidedBy" to lead.uid,
            "decidedByName" to lead.displayName,
        )
        if (status == Shift.Status.Approved) data["approvedUntil"] = Timestamp(Date(ShiftClock.end(now)))
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
    )

    private companion object {
        const val SHIFTS = "shifts"
    }
}
