package gr.barlab.negroni.auth

/** Client-side checks for a new password; the changeOwnPassword function re-checks on the server. */
object PasswordRules {
    const val MIN_LENGTH = 6 // Firebase Auth minimum

    fun check(username: String, current: String, new: String, confirm: String): AuthFailure.Reason? = when {
        new.length < MIN_LENGTH -> AuthFailure.Reason.PasswordTooShort
        new != confirm -> AuthFailure.Reason.PasswordMismatch
        new == current -> AuthFailure.Reason.PasswordSameAsCurrent
        new == username + username -> AuthFailure.Reason.PasswordSameAsInitial
        else -> null
    }
}
