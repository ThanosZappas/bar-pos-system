package gr.barlab.negroni.auth

import com.google.firebase.FirebaseNetworkException
import com.google.firebase.FirebaseTooManyRequestsException
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException
import com.google.firebase.auth.FirebaseAuthInvalidUserException
import com.google.firebase.functions.FirebaseFunctionsException

class AuthFailure(val reason: Reason, val detail: String? = null) : Exception(detail ?: reason.name) {
    enum class Reason {
        WrongCredentials,
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
        fun from(e: Throwable): AuthFailure = when (e) {
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
            else -> AuthFailure(Reason.Unknown, e.message)
        }
    }
}
