package gr.barlab.negroni.ui.auth

import gr.barlab.negroni.ui.components.caps
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import gr.barlab.negroni.R
import gr.barlab.negroni.auth.AuthFailure
import gr.barlab.negroni.auth.PasswordRules
import gr.barlab.negroni.auth.SessionRepository
import gr.barlab.negroni.auth.StaffUser
import gr.barlab.negroni.ui.components.PasswordField
import gr.barlab.negroni.ui.theme.Spacing
import kotlinx.coroutines.launch

class ChangePasswordViewModel(private val sessions: SessionRepository, private val username: String) : ViewModel() {
    var current by mutableStateOf("")
    var new by mutableStateOf("")
    var confirm by mutableStateOf("")
    var busy by mutableStateOf(false)
        private set
    var error by mutableStateOf<AuthFailure?>(null)
        private set

    val canSubmit get() = !busy && current.isNotEmpty() && new.isNotEmpty() && confirm.isNotEmpty()

    fun submit() {
        if (!canSubmit) return
        busy = true
        error = null
        viewModelScope.launch {
            // On success the profile listener sees mustChangePassword=false and the app moves on.
            sessions.changePassword(username, current, new, confirm).onFailure { error = it as? AuthFailure }
            busy = false
        }
    }
}

@Composable
fun ChangePasswordScreen(sessions: SessionRepository, user: StaffUser) {
    // Keyed by user: the activity outlives sign-outs, and the next person must not get this one's form.
    val vm = viewModel(key = "change-password-${user.uid}") { ChangePasswordViewModel(sessions, user.username) }
    Column(
        modifier = Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(Spacing.xxl),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(Modifier.widthIn(max = 420.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.m)) {
            Text(stringResource(R.string.change_password_title), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
            Text(stringResource(R.string.change_password_explainer), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary)
            PasswordField(value = vm.current, onValueChange = { vm.current = it }, label = stringResource(R.string.current_password))
            PasswordField(
                value = vm.new,
                onValueChange = { vm.new = it },
                label = stringResource(R.string.new_password),
                supportingText = pluralStringResource(R.plurals.new_password_hint, PasswordRules.MIN_LENGTH, PasswordRules.MIN_LENGTH),
            )
            PasswordField(
                value = vm.confirm,
                onValueChange = { vm.confirm = it },
                label = stringResource(R.string.confirm_password),
                imeAction = ImeAction.Done,
                onDone = vm::submit,
            )
            vm.error?.let { Text(authFailureMessage(it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
            Button(onClick = vm::submit, enabled = vm.canSubmit, modifier = Modifier.fillMaxWidth().padding(top = Spacing.s)) {
                Text(stringResource(R.string.save_password).caps(), style = MaterialTheme.typography.labelLarge)
            }
            TextButton(onClick = sessions::signOut, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                Text(stringResource(R.string.sign_out))
            }
        }
    }
}
