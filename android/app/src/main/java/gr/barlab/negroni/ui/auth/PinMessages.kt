package gr.barlab.negroni.ui.auth

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import gr.barlab.negroni.R
import gr.barlab.negroni.auth.PinFailure

/** What the PIN screens say for a failure. Locks are shown with a live countdown instead. */
@Composable
fun pinFailureMessage(failure: PinFailure, nowMs: Long): String = when (failure) {
    is PinFailure.WrongPin ->
        if (failure.lockedUntilMs != null) stringResource(R.string.pin_locked, countdown(failure.lockedUntilMs - nowMs))
        else pluralStringResource(R.plurals.pin_wrong, failure.triesLeft, failure.triesLeft)
    is PinFailure.Locked -> stringResource(R.string.pin_locked, countdown(failure.untilMs - nowMs))
    PinFailure.NoPin -> stringResource(R.string.pin_no_pin)
    PinFailure.NeedPassword -> stringResource(R.string.pin_need_password)
    PinFailure.CurrentPinNeeded -> stringResource(R.string.pin_current_needed)
    PinFailure.BadFormat -> stringResource(R.string.pin_bad_format)
    PinFailure.TicketExpired -> stringResource(R.string.pin_enter_hint)
    PinFailure.PhoneRemoved -> stringResource(R.string.pin_phone_removed)
    PinFailure.NotOnPhone -> stringResource(R.string.pin_not_on_phone)
    PinFailure.Deactivated -> stringResource(R.string.error_deactivated)
    PinFailure.LoginNotAllowed -> stringResource(R.string.login_not_allowed_body)
    PinFailure.Gone -> stringResource(R.string.pin_gone)
    PinFailure.BiometricOff -> stringResource(R.string.pin_biometric_off)
    PinFailure.SharedPhone -> stringResource(R.string.pin_shared_phone)
    PinFailure.Network -> stringResource(R.string.error_network)
    is PinFailure.Unknown -> stringResource(R.string.error_unknown, failure.message.orEmpty())
}
