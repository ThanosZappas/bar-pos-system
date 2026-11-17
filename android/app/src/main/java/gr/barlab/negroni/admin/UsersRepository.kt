package gr.barlab.negroni.admin

import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.snapshots
import com.google.firebase.functions.FirebaseFunctions
import gr.barlab.negroni.auth.AuthFailure
import gr.barlab.negroni.auth.Rights
import gr.barlab.negroni.auth.Role
import gr.barlab.negroni.auth.StaffUser
import gr.barlab.negroni.data.keepAlive
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await

/** A user as the admin manages them. [pinLockedUntilMs]: locked after wrong PINs until then. */
data class ManagedUser(val user: StaffUser, val active: Boolean, val pinLockedUntilMs: Long? = null)

/** A phone where staff sign in with a PIN (devices/{id}, see functions/src/devices.ts). */
data class Phone(val id: String, val name: String, val profiles: List<String>, val lastUsedMs: Long?)

/**
 * Admin user management on the phone, through the same Cloud Functions as the dashboard (the rules
 * let no client write user profiles). These calls need a connection.
 */
class UsersRepository(private val db: FirebaseFirestore, private val functions: FirebaseFunctions) {

    /** Everyone except deleted users, by username. Readable by barman and admin. */
    val users: Flow<List<ManagedUser>> = db.collection("users").snapshots().map { snap ->
        snap.documents.filter { it.getBoolean("deleted") != true }.mapNotNull { d ->
            val role = Role.fromWire(d.getString("role")) ?: return@mapNotNull null
            ManagedUser(
                StaffUser(
                    uid = d.id,
                    username = d.getString("username").orEmpty(),
                    displayName = d.getString("displayName").orEmpty(),
                    role = role,
                    mustChangePassword = d.getBoolean("mustChangePassword") != false,
                    rights = Rights.from(d.get("rights") as? Map<*, *>),
                    icon = d.getString("icon"),
                    photoVersion = d.getLong("photoVersion"),
                    pinSet = d.getBoolean("pinSet") == true,
                ),
                active = d.getBoolean("active") == true,
                pinLockedUntilMs = d.getTimestamp("pinLockedUntil")?.toDate()?.time,
            )
        }.sortedBy { it.user.username }
    }.keepAlive()

    suspend fun create(username: String, displayName: String, role: Role, tempPassword: String): Result<Unit> =
        call("createUser", mapOf("username" to username.trim(), "displayName" to displayName.trim(), "role" to role.wire, "password" to tempPassword))

    suspend fun rename(uid: String, displayName: String, role: Role): Result<Unit> =
        call("updateUser", mapOf("uid" to uid, "displayName" to displayName.trim(), "role" to role.wire))

    suspend fun setActive(uid: String, active: Boolean): Result<Unit> = call("updateUser", mapOf("uid" to uid, "active" to active))

    suspend fun setRights(uid: String, rights: Rights): Result<Unit> = call(
        "updateUser",
        mapOf(
            "uid" to uid,
            "rights" to mapOf(
                "logIn" to rights.logIn,
                "noApproval" to rights.noApproval,
                "payments" to rights.payments,
                "reversePayments" to rights.reversePayments,
                "closeTables" to rights.closeTables,
                "cancelOrders" to rights.cancelOrders,
                "moveTables" to rights.moveTables,
            ),
        ),
    )

    suspend fun resetPassword(uid: String, tempPassword: String): Result<Unit> =
        call("resetPassword", mapOf("uid" to uid, "password" to tempPassword))

    suspend fun delete(uid: String): Result<Unit> = call("deleteUser", mapOf("uid" to uid))

    /** Deletes their PIN (and fingerprint unlock) and signs them out: they choose a new one with their password. */
    suspend fun resetPin(uid: String): Result<Unit> = call("resetPin", mapOf("uid" to uid))

    suspend fun unlockPin(uid: String): Result<Unit> = call("unlockPin", mapOf("uid" to uid))

    /** Phones where staff sign in with a PIN, most recently used first. Admin only. */
    val phones: Flow<List<Phone>> = db.collection("devices").snapshots().map { snap ->
        snap.documents.map { d ->
            Phone(
                id = d.id,
                name = d.getString("name").orEmpty(),
                profiles = (d.get("profiles") as? List<*>).orEmpty().filterIsInstance<String>(),
                lastUsedMs = d.getTimestamp("lastUsedAt")?.toDate()?.time,
            )
        }.sortedByDescending { it.lastUsedMs ?: 0 }
    }.keepAlive()

    /** A lost phone: nobody can sign in on it with a PIN until someone signs in there with a password. */
    suspend fun removePhone(id: String): Result<Unit> = call("removeDevice", mapOf("deviceId" to id))

    private suspend fun call(name: String, data: Map<String, Any>): Result<Unit> = runCatching {
        functions.getHttpsCallable(name).call(data).await()
        Unit
    }.recoverCatching { throw AuthFailure.from(it) }
}
