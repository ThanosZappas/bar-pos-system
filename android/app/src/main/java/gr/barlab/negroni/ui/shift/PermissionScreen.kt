package gr.barlab.negroni.ui.shift

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import gr.barlab.negroni.R
import gr.barlab.negroni.auth.ShiftClock
import gr.barlab.negroni.auth.StaffUser
import gr.barlab.negroni.shift.Shift
import gr.barlab.negroni.ui.components.BrandHeader
import gr.barlab.negroni.ui.components.caps
import gr.barlab.negroni.ui.theme.BarLabColors
import gr.barlab.negroni.ui.theme.Spacing

/**
 * What a server sees after the day's login until the barman lets them work: one button.
 * The screen moves on by itself as soon as the approval arrives.
 */
@Composable
fun PermissionScreen(user: StaffUser, shift: Shift?, nowMs: Long, onRequest: () -> Unit, onSignOut: () -> Unit) {
    val today = ShiftClock.key(nowMs)
    val thisShift = shift?.takeIf { it.shiftDay == today }
    val waiting = thisShift?.status == Shift.Status.Requested
    val blocked = shift?.blockedAt(nowMs) == true
    val oneMoreTry = !blocked && thisShift?.status == Shift.Status.Denied && (shift?.denialsThisShift(nowMs) ?: 0) >= 1
    Column(
        Modifier.fillMaxSize().padding(Spacing.xxl),
        verticalArrangement = Arrangement.spacedBy(Spacing.l, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        BrandHeader(Modifier.padding(bottom = Spacing.xxl))
        Text(stringResource(R.string.permission_hello, user.displayName), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary, textAlign = TextAlign.Center)
        val message = when {
            blocked -> stringResource(R.string.permission_blocked, shift?.decidedByName.orEmpty())
            oneMoreTry -> stringResource(R.string.permission_denied_once, thisShift?.decidedByName.orEmpty())
            else -> when (thisShift?.status) {
            Shift.Status.Requested -> stringResource(R.string.permission_waiting)
            Shift.Status.Denied -> stringResource(R.string.permission_denied, thisShift.decidedByName.orEmpty())
            Shift.Status.Cleared -> stringResource(R.string.permission_cleared)
            Shift.Status.Revoked -> stringResource(R.string.permission_revoked, thisShift.decidedByName.orEmpty())
            else -> stringResource(R.string.permission_explainer)
            }
        }
        Text(
            message,
            style = MaterialTheme.typography.bodyLarge,
            color = if (blocked || thisShift?.status == Shift.Status.Denied || thisShift?.status == Shift.Status.Revoked) BarLabColors.Error else MaterialTheme.colorScheme.secondary,
            textAlign = TextAlign.Center,
        )
        if (waiting) {
            CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
        } else if (!blocked) {
            Button(onClick = onRequest, modifier = Modifier.widthIn(max = 420.dp).fillMaxWidth().height(64.dp)) {
                Text(stringResource(R.string.permission_request).caps(), style = MaterialTheme.typography.labelLarge)
            }
        }
        TextButton(onClick = onSignOut) { Text(stringResource(R.string.switch_user)) }
    }
}
