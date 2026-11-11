package gr.barlab.negroni.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import gr.barlab.negroni.sync.SyncStatus
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.flowOf
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import gr.barlab.negroni.AppContainer
import gr.barlab.negroni.R
import gr.barlab.negroni.auth.Session
import gr.barlab.negroni.ui.auth.ChangePasswordScreen
import gr.barlab.negroni.ui.auth.LoginScreen
import gr.barlab.negroni.ui.components.MessageScreen

/** The session decides the screen: nothing past sign-in is reachable before the password change. */
@Composable
fun RootScreen(container: AppContainer) {
    val sessions = container.sessions
    val catalog = container.catalog
    val orders = container.orders
    val shifts = container.shifts
    if (sessions == null || catalog == null || orders == null || shifts == null) {
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
    when (val s = session) {
        Session.Loading -> MessageScreen(stringResource(R.string.loading))
        Session.SignedOut -> LoginScreen(sessions)
        Session.Deactivated -> MessageScreen(stringResource(R.string.deactivated_title), stringResource(R.string.error_deactivated), sessions::signOut)
        Session.NoProfile -> MessageScreen(stringResource(R.string.no_profile_title), stringResource(R.string.no_profile_body), sessions::signOut)
        Session.LoginNotAllowed -> MessageScreen(stringResource(R.string.login_not_allowed_title), stringResource(R.string.login_not_allowed_body), sessions::signOut)
        is Session.Active ->
            if (s.user.mustChangePassword) ChangePasswordScreen(sessions, s.user)
            else SignedInApp(s.user, catalog, orders, shifts, container.users, container.sync, now, shiftOver, sessions::signOut)
    }
}
