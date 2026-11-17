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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import gr.barlab.negroni.R
import gr.barlab.negroni.auth.AuthFailure
import gr.barlab.negroni.auth.SessionRepository
import gr.barlab.negroni.ui.components.BrandHeader
import gr.barlab.negroni.ui.components.PasswordField
import gr.barlab.negroni.ui.theme.Spacing
import kotlinx.coroutines.launch

class LoginViewModel(private val sessions: SessionRepository) : ViewModel() {
    var username by mutableStateOf("")
    var password by mutableStateOf("")
    var busy by mutableStateOf(false)
        private set
    var error by mutableStateOf<AuthFailure?>(null)
        private set

    val canSubmit get() = !busy && username.isNotBlank() && password.isNotEmpty()

    fun submit() {
        if (!canSubmit) return
        busy = true
        error = null
        viewModelScope.launch {
            sessions.signIn(username, password)
                .onSuccess { clear() } // the next person on this phone starts with an empty form
                .onFailure { error = it as? AuthFailure }
            busy = false
        }
    }

    fun clear() {
        username = ""
        password = ""
        error = null
    }
}

/**
 * Username and password: the first sign-in on a phone, "Add / other account", a profile without
 * a PIN, or "Use password instead". Success also puts the profile on this phone's grid.
 * [onBack] returns to the grid (null when the phone has no profiles yet).
 */
@Composable
fun LoginScreen(sessions: SessionRepository, note: PasswordNote? = null, onBack: (() -> Unit)? = null) {
    val vm = viewModel { LoginViewModel(sessions) }
    Column(Modifier.fillMaxSize()) {
        onBack?.let { back ->
            TextButton(onClick = { vm.clear(); back() }, modifier = Modifier.padding(start = Spacing.s, top = Spacing.m)) {
                Text("‹ " + stringResource(R.string.back_to_profiles))
            }
        }
        Column(
            modifier = Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(Spacing.xxl),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            BrandHeader(Modifier.padding(bottom = Spacing.hero))
            Column(Modifier.widthIn(max = 420.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.m)) {
                Text(
                    stringResource(
                        when (note) {
                            PasswordNote.ChoosePin -> R.string.pin_no_pin
                            PasswordNote.PhoneRemoved -> R.string.pin_phone_removed
                            PasswordNote.NotOnPhone -> R.string.pin_not_on_phone
                            PasswordNote.AddProfile, null -> R.string.password_note_add
                        },
                    ),
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (note == PasswordNote.PhoneRemoved || note == PasswordNote.NotOnPhone) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.secondary,
                )
                OutlinedTextField(
                    value = vm.username,
                    onValueChange = { vm.username = it },
                    label = { Text(stringResource(R.string.username)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, imeAction = ImeAction.Next),
                    modifier = Modifier.fillMaxWidth(),
                )
                PasswordField(
                    value = vm.password,
                    onValueChange = { vm.password = it },
                    label = stringResource(R.string.password),
                    imeAction = ImeAction.Done,
                    onDone = vm::submit,
                )
                vm.error?.let { Text(authFailureMessage(it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
                Button(onClick = vm::submit, enabled = vm.canSubmit, modifier = Modifier.fillMaxWidth().padding(top = Spacing.s)) {
                    Text(stringResource(R.string.sign_in).caps(), style = MaterialTheme.typography.labelLarge)
                }
            }
        }
    }
}
