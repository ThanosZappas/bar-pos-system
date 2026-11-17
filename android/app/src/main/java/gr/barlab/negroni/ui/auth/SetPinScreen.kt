package gr.barlab.negroni.ui.auth

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import gr.barlab.negroni.R
import gr.barlab.negroni.auth.PhoneRepository
import gr.barlab.negroni.auth.PinException
import gr.barlab.negroni.auth.PinFailure
import gr.barlab.negroni.auth.PinRules
import gr.barlab.negroni.auth.Role
import gr.barlab.negroni.auth.StaffUser
import gr.barlab.negroni.ui.theme.Spacing
import kotlinx.coroutines.launch

/**
 * Choosing a PIN (first sign-in, or after the admin reset it) or changing it (current PIN first).
 * The new PIN is typed twice; the server checks the length again and stores only a hash.
 */
class SetPinViewModel(private val phone: PhoneRepository, private val role: Role, changing: Boolean) : ViewModel() {
    enum class Phase { Current, New, Confirm }

    var phase by mutableStateOf(if (changing) Phase.Current else Phase.New)
        private set
    var entry by mutableStateOf("")
        private set
    var busy by mutableStateOf(false)
        private set
    var failure by mutableStateOf<PinFailure?>(null)
        private set
    var mismatch by mutableStateOf(false)
        private set
    var shakes by mutableIntStateOf(0)
        private set
    var done by mutableStateOf(false)
        private set
    private var current: String? = null
    private var first = ""

    val min get() = PinRules.minLength(role)

    fun digit(d: Char) {
        if (busy || entry.length >= PinRules.MAX) return
        failure = null
        mismatch = false
        entry += d
    }

    fun backspace() {
        if (!busy) entry = entry.dropLast(1)
    }

    fun submit() {
        if (busy || entry.isEmpty()) return
        when (phase) {
            Phase.Current -> {
                current = entry
                entry = ""
                phase = Phase.New
            }
            Phase.New -> {
                if (!PinRules.isValid(entry, role)) {
                    failure = PinFailure.BadFormat(min, PinRules.MAX)
                    entry = ""
                    shakes++
                    return
                }
                first = entry
                entry = ""
                phase = Phase.Confirm
            }
            Phase.Confirm -> if (entry != first) {
                mismatch = true
                entry = ""
                first = ""
                phase = Phase.New
                shakes++
            } else {
                save()
            }
        }
    }

    private fun save() {
        busy = true
        viewModelScope.launch {
            phone.setPin(first, current)
                .onSuccess { done = true }
                .onFailure { e ->
                    val f = (e as? PinException)?.failure ?: PinFailure.Unknown(e.message)
                    failure = f
                    entry = ""
                    first = ""
                    // A wrong current PIN sends the person back to typing it.
                    if (f is PinFailure.WrongPin || f is PinFailure.Locked || f == PinFailure.CurrentPinNeeded) {
                        current = null
                        phase = Phase.Current
                    } else {
                        phase = Phase.New
                    }
                    shakes++
                }
            busy = false
        }
    }
}

/**
 * [changing]: from Settings, with [onCancel] and [onDone]. Otherwise the first PIN, right after a
 * password sign-in: the screen goes away by itself once the profile says a PIN is set.
 */
@Composable
fun SetPinScreen(
    phone: PhoneRepository,
    user: StaffUser,
    changing: Boolean,
    onCancel: () -> Unit,
    onDone: () -> Unit = {},
    cancelLabel: String = stringResource(R.string.sign_out),
) {
    val vm = viewModel(key = "set-pin-${user.uid}-$changing") { SetPinViewModel(phone, user.role, changing) }
    LaunchedEffect(vm.done) { if (vm.done) onDone() }
    val now = rememberNowUntil((vm.failure as? PinFailure.Locked)?.untilMs ?: (vm.failure as? PinFailure.WrongPin)?.lockedUntilMs)
    val title = when (vm.phase) {
        SetPinViewModel.Phase.Current -> R.string.pin_current_title
        SetPinViewModel.Phase.New -> R.string.pin_choose_title
        SetPinViewModel.Phase.Confirm -> R.string.pin_confirm_title
    }
    val message = when {
        vm.mismatch -> stringResource(R.string.pin_mismatch)
        else -> vm.failure?.let { pinFailureMessage(it, now) }
    }
    Column(Modifier.fillMaxSize().padding(horizontal = Spacing.xl, vertical = Spacing.m), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(Modifier.fillMaxWidth()) {
            TextButton(onClick = onCancel) { Text((if (changing) "‹ " else "") + cancelLabel) }
        }
        Spacer(Modifier.weight(1f))
        Text(stringResource(title), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary, textAlign = TextAlign.Center)
        if (vm.phase == SetPinViewModel.Phase.New) {
            Text(
                stringResource(R.string.pin_choose_hint, vm.min, PinRules.MAX),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.secondary,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = Spacing.s),
            )
        }
        PinDots(vm.entry.length, minDots = vm.min, shakeKey = vm.shakes, error = message != null, modifier = Modifier.padding(top = Spacing.xxl))
        Box(Modifier.heightIn(min = 56.dp).padding(top = Spacing.m), contentAlignment = Alignment.TopCenter) {
            message?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center) }
        }
        Spacer(Modifier.weight(1f))
        Box(Modifier.heightIn(min = 4.dp).fillMaxWidth()) { if (vm.busy) LinearProgressIndicator(Modifier.fillMaxWidth()) }
        PinKeypad(
            enabled = !vm.busy,
            onDigit = vm::digit,
            onBackspace = vm::backspace,
            onSubmit = vm::submit,
            deleteLabel = stringResource(R.string.pin_delete),
            enterLabel = stringResource(R.string.pin_next),
            modifier = Modifier.padding(top = Spacing.m, bottom = Spacing.xxl),
        )
    }
}
