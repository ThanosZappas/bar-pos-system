package gr.barlab.negroni.ui.auth

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import gr.barlab.negroni.R
import gr.barlab.negroni.auth.AuthFailure
import gr.barlab.negroni.auth.AuthFailure.Reason
import gr.barlab.negroni.auth.PasswordRules

@Composable
fun authFailureMessage(failure: AuthFailure): String = when (failure.reason) {
    Reason.WrongCredentials -> stringResource(R.string.error_wrong_credentials)
    Reason.Deactivated -> stringResource(R.string.error_deactivated)
    Reason.Network -> stringResource(R.string.error_network)
    Reason.TooManyAttempts -> stringResource(R.string.error_too_many_attempts)
    Reason.PasswordTooShort -> stringResource(R.string.error_password_too_short, PasswordRules.MIN_LENGTH)
    Reason.PasswordMismatch -> stringResource(R.string.error_password_mismatch)
    Reason.PasswordSameAsCurrent -> stringResource(R.string.error_password_same_as_current)
    Reason.PasswordSameAsInitial -> stringResource(R.string.error_password_same_as_initial)
    Reason.Server -> stringResource(R.string.error_server, failure.detail.orEmpty())
    Reason.Unknown -> stringResource(R.string.error_unknown)
}
