package gr.barlab.negroni.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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
    if (sessions == null || catalog == null || orders == null) {
        MessageScreen(stringResource(R.string.not_configured_title), stringResource(R.string.not_configured_body))
        return
    }
    val session by sessions.session.collectAsStateWithLifecycle(initialValue = Session.Loading)
    when (val s = session) {
        Session.Loading -> MessageScreen(stringResource(R.string.loading))
        Session.SignedOut -> LoginScreen(sessions)
        Session.Deactivated -> MessageScreen(stringResource(R.string.deactivated_title), stringResource(R.string.error_deactivated), sessions::signOut)
        Session.NoProfile -> MessageScreen(stringResource(R.string.no_profile_title), stringResource(R.string.no_profile_body), sessions::signOut)
        is Session.Active ->
            if (s.user.mustChangePassword) ChangePasswordScreen(sessions, s.user)
            else SignedInApp(s.user, catalog, orders, container.sync, sessions::signOut)
    }
}
