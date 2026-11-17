package gr.barlab.negroni.ui.auth

import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.fragment.app.FragmentActivity
import gr.barlab.negroni.R
import gr.barlab.negroni.auth.Fingerprint
import gr.barlab.negroni.auth.StaffUser
import gr.barlab.negroni.ui.theme.BarLabColors
import gr.barlab.negroni.ui.theme.Spacing
import kotlinx.coroutines.launch

/** Settings switch for fingerprint unlock. Hidden on a phone without a fingerprint set up. */
@Composable
fun FingerprintSetting(user: StaffUser, fingerprint: Fingerprint) {
    if (!fingerprint.isAvailable) return
    val activity = LocalActivity.current as? FragmentActivity ?: return
    val scope = rememberCoroutineScope()
    var on by remember(user.uid) { mutableStateOf(fingerprint.isOn(user.uid)) }
    var busy by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<Fingerprint.Result?>(null) }
    val canTurnOn = fingerprint.canTurnOn(user.uid)
    val title = stringResource(R.string.biometric_prompt_enable)
    val cancel = stringResource(R.string.dialog_cancel)

    Column {
        Row(
            Modifier.fillMaxWidth().toggleable(value = on, enabled = !busy && (on || canTurnOn), role = Role.Switch, onValueChange = { want ->
                busy = true
                problem = null
                scope.launch {
                    val r = if (want) fingerprint.turnOn(activity, user.uid, title, cancel) else fingerprint.turnOff(user.uid)
                    on = fingerprint.isOn(user.uid)
                    if (r !is Fingerprint.Result.Done && r != Fingerprint.Result.Cancelled) problem = r
                    busy = false
                }
            }),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f).padding(end = Spacing.m)) {
                Text(stringResource(R.string.biometric_title), style = MaterialTheme.typography.bodyLarge)
                Text(
                    stringResource(if (on || canTurnOn) R.string.biometric_settings_hint else R.string.pin_shared_phone),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Switch(checked = on, onCheckedChange = null, enabled = !busy && (on || canTurnOn))
        }
        problem?.let { Text(fingerprintProblem(it), color = BarLabColors.Error, style = MaterialTheme.typography.bodyMedium) }
    }
}

/** Offered once, on the first sign-in of the only profile on a phone with a fingerprint set up. */
@Composable
fun FingerprintOffer(user: StaffUser, fingerprint: Fingerprint) {
    val activity = LocalActivity.current as? FragmentActivity ?: return
    var show by remember(user.uid) {
        mutableStateOf(fingerprint.canTurnOn(user.uid) && !fingerprint.isOn(user.uid) && !fingerprint.wasOffered(user.uid))
    }
    val scope = rememberCoroutineScope()
    val title = stringResource(R.string.biometric_prompt_enable)
    val cancel = stringResource(R.string.dialog_cancel)
    if (!show) return
    AlertDialog(
        onDismissRequest = { fingerprint.markOffered(user.uid); show = false },
        title = { Text(stringResource(R.string.biometric_offer_title)) },
        text = { Text(stringResource(R.string.biometric_offer_body)) },
        confirmButton = {
            TextButton(onClick = {
                fingerprint.markOffered(user.uid)
                show = false
                scope.launch { fingerprint.turnOn(activity, user.uid, title, cancel) }
            }) { Text(stringResource(R.string.biometric_turn_on)) }
        },
        dismissButton = { TextButton(onClick = { fingerprint.markOffered(user.uid); show = false }) { Text(stringResource(R.string.biometric_not_now)) } },
    )
}

@Composable
private fun fingerprintProblem(r: Fingerprint.Result): String = when (r) {
    Fingerprint.Result.Changed -> stringResource(R.string.biometric_changed)
    is Fingerprint.Result.Refused -> pinFailureMessage(r.failure, System.currentTimeMillis())
    else -> ""
}
