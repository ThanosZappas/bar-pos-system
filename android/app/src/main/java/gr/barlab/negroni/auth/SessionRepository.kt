package gr.barlab.negroni.auth

import com.google.firebase.auth.EmailAuthProvider
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.tasks.await

class SessionRepository(
    private val device: DeviceLogin,
    private val auth: FirebaseAuth,
    private val db: FirebaseFirestore,
    private val functions: FirebaseFunctions,
) {
    /** Current session. The profile comes from Firestore's cache when offline. */
    @OptIn(ExperimentalCoroutinesApi::class)
    val session: Flow<Session> = signedInUid()
        .flatMapLatest { uid -> if (uid == null) flowOf(Session.SignedOut) else profile(uid) }
        .distinctUntilChanged()

    private fun signedInUid(): Flow<String?> = callbackFlow {
        val listener = FirebaseAuth.AuthStateListener { trySend(it.currentUser?.uid) }
        auth.addAuthStateListener(listener)
        awaitClose { auth.removeAuthStateListener(listener) }
    }.distinctUntilChanged()

    private fun profile(uid: String): Flow<Session> = callbackFlow {
        val registration = db.document("users/$uid").addSnapshotListener { snap, error ->
            when {
                // Denied while signing out is just the race with the auth listener; otherwise the
                // token no longer grants access to this profile.
                error != null -> trySend(if (auth.currentUser == null) Session.SignedOut else Session.NoProfile)
                snap == null -> Unit
                // Not cached yet and still offline: keep showing Loading.
                !snap.exists() && snap.metadata.isFromCache -> Unit
                else -> trySend(snap.toSession(uid))
            }
        }
        awaitClose { registration.remove() }
    }.onStart { emit(Session.Loading) }

    private fun DocumentSnapshot.toSession(uid: String): Session {
        if (!exists()) return Session.NoProfile
        if (getBoolean("active") != true) return Session.Deactivated
        val role = Role.fromWire(getString("role")) ?: return Session.NoProfile
        return Session.Active(
            StaffUser(
                uid = uid,
                username = getString("username").orEmpty(),
                displayName = getString("displayName").orEmpty(),
                role = role,
                mustChangePassword = getBoolean("mustChangePassword") != false,
                rights = Rights.from(get("rights") as? Map<*, *>),
            ),
        )
    }

    suspend fun signIn(username: String, password: String): Result<Unit> = runCatching {
        val email = Usernames.toEmail(username) ?: throw AuthFailure(AuthFailure.Reason.WrongCredentials)
        device.startShift()
        auth.signInWithEmailAndPassword(email, password).await()
        device.rememberUsername(Usernames.normalize(username))
        Unit
    }.recoverCatching { throw AuthFailure.from(it) }

    /** Username to prefill on the login screen (the last one that signed in on this phone). */
    val lastUsername: String get() = device.lastUsername

    /**
     * Verifies the current password, lets the server set the new one (which also clears
     * mustChangePassword), then signs in again because a password change can revoke the session.
     */
    suspend fun changePassword(username: String, current: String, new: String, confirm: String): Result<Unit> = runCatching {
        PasswordRules.check(username, current, new, confirm)?.let { throw AuthFailure(it) }
        val user = auth.currentUser ?: throw AuthFailure(AuthFailure.Reason.WrongCredentials)
        val email = Usernames.toEmail(username) ?: throw AuthFailure(AuthFailure.Reason.WrongCredentials)
        try {
            user.reauthenticate(EmailAuthProvider.getCredential(email, current)).await()
        } catch (e: Exception) {
            // On this screen a refused credential means the current password was mistyped.
            val failure = AuthFailure.from(e)
            throw if (failure.reason == AuthFailure.Reason.WrongCredentials) AuthFailure(AuthFailure.Reason.WrongCurrentPassword) else failure
        }
        functions.getHttpsCallable("changeOwnPassword").call(mapOf("password" to new)).await()
        auth.signInWithEmailAndPassword(email, new).await()
        Unit
    }.recoverCatching { throw AuthFailure.from(it) }

    fun signOut() {
        device.forget()
        auth.signOut()
    }

    /** The login on this phone belongs to an earlier shift (they change at 18:00). */
    fun loginExpired(nowMs: Long = System.currentTimeMillis()): Boolean = auth.currentUser != null && device.expired(nowMs)
}
