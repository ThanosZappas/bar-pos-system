package gr.barlab.negroni.ui.home

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import gr.barlab.negroni.R
import gr.barlab.negroni.auth.Role
import gr.barlab.negroni.auth.StaffUser
import gr.barlab.negroni.ui.components.MessageScreen

/** Placeholder until the table grid (milestone 4) and the order board (milestone 5). */
@Composable
fun HomeScreen(user: StaffUser, onSignOut: () -> Unit) {
    val role = stringResource(
        when (user.role) {
            Role.Admin -> R.string.role_admin
            Role.Barman -> R.string.role_barman
            Role.Server -> R.string.role_server
        },
    )
    MessageScreen(
        title = stringResource(R.string.home_signed_in_as, "${user.displayName} · $role"),
        body = stringResource(R.string.home_placeholder),
        onSignOut = onSignOut,
    )
}
