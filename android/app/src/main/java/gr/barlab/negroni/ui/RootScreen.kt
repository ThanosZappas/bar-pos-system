package gr.barlab.negroni.ui

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import gr.barlab.negroni.AppContainer
import gr.barlab.negroni.R
import gr.barlab.negroni.auth.PinException
import gr.barlab.negroni.auth.PinFailure
import gr.barlab.negroni.auth.Session
import gr.barlab.negroni.sync.SyncStatus
import gr.barlab.negroni.ui.auth.ChangePasswordScreen
import gr.barlab.negroni.ui.auth.SetPinScreen
import gr.barlab.negroni.ui.auth.SignInScreen
import gr.barlab.negroni.ui.auth.pinFailureMessage
import gr.barlab.negroni.ui.components.MessageScreen
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch

/**
 * The session decides the screen: signed out shows the profile grid; nothing past sign-in is
 * reachable before the password change and the first PIN.
 */
@Composable
fun RootScreen(container: AppContainer) {
    val sessions = container.sessions
    val phone = container.phone
    val catalog = container.catalog
    val orders = container.orders
    val shifts = container.shifts
    if (sessions == null || phone == null || catalog == null || orders == null || shifts == null) {
        MessageScreen(stringResource(R.string.not_configured_title), stringResource(R.string.not_configured_body))
        return
    }
    val session by sessions.session.collectAsStateWithLifecycle(initialValue = Session.Loading)
    val syncStatus by (container.sync?.status ?: flowOf(SyncStatus.Synced)).collectAsStateWithLifecycle(initialValue = SyncStatus.Synced)

    // Logins last until the next 18:00. Checked every 30 s; the sign-out waits until every queued
    // order and payment has reached the server, so the shift change never strands a write.
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(30_000)
            now = System.currentTimeMillis()
        }
    }
    val shiftOver = session is Session.Active && sessions.loginExpired(now)
    LaunchedEffect(shiftOver, syncStatus) {
        if (shiftOver && syncStatus == SyncStatus.Synced) sessions.signOut()
    }

    // Switching user signs this person out. Firestore keeps each person's unsent writes in their
    // own queue, so a switch with writes still waiting would leave them stuck until that person
    // signed in again: wait until everything has reached the server.
    val pending = when (val s = syncStatus) {
        SyncStatus.Synced -> 0
        is SyncStatus.Syncing -> s.pending
        is SyncStatus.Offline -> s.pending
    }
    var waiting by remember { mutableStateOf(false) }
    var removeFailed by remember { mutableStateOf<PinFailure?>(null) }
    val scope = rememberCoroutineScope()
    val switchUser = { if (pending == 0) sessions.signOut() else waiting = true }

    when (val s = session) {
        Session.Loading -> MessageScreen(stringResource(R.string.loading))
        Session.SignedOut -> SignInScreen(phone, sessions)
        Session.Deactivated -> MessageScreen(stringResource(R.string.deactivated_title), stringResource(R.string.error_deactivated), sessions::signOut)
        Session.NoProfile -> MessageScreen(stringResource(R.string.no_profile_title), stringResource(R.string.no_profile_body), sessions::signOut)
        Session.LoginNotAllowed -> MessageScreen(stringResource(R.string.login_not_allowed_title), stringResource(R.string.login_not_allowed_body), sessions::signOut)
        is Session.Active -> when {
            s.user.mustChangePassword -> ChangePasswordScreen(sessions, s.user)
            !s.user.pinSet -> SetPinScreen(phone, s.user, changing = false, onCancel = sessions::signOut)
            else -> SignedInApp(
                s.user, catalog, orders, shifts, container.users, container.profiles, phone, container.sync, now, shiftOver,
                onSwitchUser = switchUser,
                onRemoveFromPhone = {
                    if (pending > 0) waiting = true
                    else scope.launch {
                        phone.forget(s.user.uid)
                            .onSuccess { sessions.signOut() }
                            .onFailure { removeFailed = (it as? PinException)?.failure ?: PinFailure.Unknown(it.message) }
                    }
                },
            )
        }
    }

    if (waiting) {
        AlertDialog(
            onDismissRequest = { waiting = false },
            title = { Text(stringResource(R.string.switch_wait_title)) },
            text = { Text(pluralStringResource(R.plurals.switch_wait_body, pending, pending)) },
            confirmButton = { TextButton(onClick = { waiting = false }) { Text(stringResource(R.string.dialog_ok)) } },
        )
    }
    removeFailed?.let { f ->
        AlertDialog(
            onDismissRequest = { removeFailed = null },
            text = { Text(pinFailureMessage(f, now)) },
            confirmButton = { TextButton(onClick = { removeFailed = null }) { Text(stringResource(R.string.dialog_ok)) } },
        )
    }
}
