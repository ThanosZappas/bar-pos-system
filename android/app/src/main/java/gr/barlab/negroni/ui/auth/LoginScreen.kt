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
    // The phone remembers who signed in last; only the password is needed.
    var username by mutableStateOf(sessions.lastUsername)
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
                .onSuccess { password = "" }
                .onFailure { error = it as? AuthFailure }
            busy = false
        }
    }
}

@Composable
fun LoginScreen(sessions: SessionRepository) {
    val vm = viewModel { LoginViewModel(sessions) }
    Column(
        modifier = Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(Spacing.xxl),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        BrandHeader(Modifier.padding(bottom = Spacing.hero))
        Column(Modifier.widthIn(max = 420.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.m)) {
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
