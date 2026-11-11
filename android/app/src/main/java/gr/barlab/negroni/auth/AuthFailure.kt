package gr.barlab.negroni.auth

import android.util.Log
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.FirebaseTooManyRequestsException
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException
import com.google.firebase.auth.FirebaseAuthInvalidUserException
import com.google.firebase.functions.FirebaseFunctionsException

class AuthFailure(val reason: Reason, val detail: String? = null) : Exception(detail ?: reason.name) {
    enum class Reason {
        WrongCredentials,
        WrongCurrentPassword,
        Deactivated,
        Network,
        TooManyAttempts,
        PasswordTooShort,
        PasswordMismatch,
        PasswordSameAsCurrent,
        PasswordSameAsInitial,
        Server,
        Unknown,
    }

    companion object {
        /** Maps a Firebase error to what the screen says; the original is logged (tag NegroniAuth). */
        fun from(e: Throwable): AuthFailure = map(e).also { if (e !is AuthFailure) Log.w("NegroniAuth", "Auth step failed (${it.reason})", e) }

        private fun map(e: Throwable): AuthFailure = when (e) {
            is AuthFailure -> e
            is FirebaseAuthInvalidUserException ->
                if (e.errorCode == "ERROR_USER_DISABLED") AuthFailure(Reason.Deactivated) else AuthFailure(Reason.WrongCredentials)
            is FirebaseAuthInvalidCredentialsException -> AuthFailure(Reason.WrongCredentials)
            is FirebaseNetworkException -> AuthFailure(Reason.Network)
            is FirebaseTooManyRequestsException -> AuthFailure(Reason.TooManyAttempts)
            is FirebaseFunctionsException -> when (e.code) {
                FirebaseFunctionsException.Code.UNAVAILABLE, FirebaseFunctionsException.Code.DEADLINE_EXCEEDED -> AuthFailure(Reason.Network)
                FirebaseFunctionsException.Code.PERMISSION_DENIED -> AuthFailure(Reason.Deactivated)
                else -> AuthFailure(Reason.Server, e.message)
            }
            else -> AuthFailure(Reason.Unknown, e.message ?: e.javaClass.simpleName)
        }
    }
}
