package gr.barlab.negroni.ui.auth

import androidx.activity.compose.BackHandler
import androidx.activity.compose.LocalActivity
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.ui.res.painterResource
import androidx.fragment.app.FragmentActivity
import gr.barlab.negroni.auth.Fingerprint
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import gr.barlab.negroni.R
import gr.barlab.negroni.auth.PhoneProfile
import gr.barlab.negroni.auth.PhoneRepository
import gr.barlab.negroni.auth.PinException
import gr.barlab.negroni.auth.PinFailure
import gr.barlab.negroni.auth.PinRules
import gr.barlab.negroni.auth.SessionRepository
import gr.barlab.negroni.ui.components.BrandHeader
import gr.barlab.negroni.ui.components.caps
import gr.barlab.negroni.ui.profile.ProfileAvatar
import gr.barlab.negroni.ui.theme.BarLabColors
import gr.barlab.negroni.ui.theme.Spacing
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Where the signed-out phone is: the profile grid, one profile's PIN pad, or the password form. */
sealed interface SignInStep {
    data object Grid : SignInStep
    data class Pin(val uid: String) : SignInStep
    data class Password(val note: PasswordNote?) : SignInStep
}

/** Why the password form is shown, said above it. */
enum class PasswordNote { AddProfile, ChoosePin, PhoneRemoved, NotOnPhone }

class SignInViewModel(private val phone: PhoneRepository, private val fingerprint: Fingerprint?) : ViewModel() {
    var step by mutableStateOf<SignInStep>(SignInStep.Grid)
        private set
    var pin by mutableStateOf("")
        private set
    var busy by mutableStateOf(false)
        private set
    var failure by mutableStateOf<PinFailure?>(null)
        private set
    var shakes by mutableIntStateOf(0)
        private set
    /** Fingerprints on the phone changed since fingerprint unlock was turned on. */
    var fingerprintChanged by mutableStateOf(false)
        private set
    /** A problem refreshing the grid (offline is not one: the saved grid still works). */
    var gridProblem by mutableStateOf<PinFailure?>(null)
        private set

    fun refresh() {
        viewModelScope.launch {
            phone.refresh()
                .onSuccess {
                    gridProblem = null
                    fingerprint?.syncWith(phone.profiles.value)
                }
                .onFailure { e ->
                    when (val f = (e as? PinException)?.failure) {
                        PinFailure.PhoneRemoved -> step = SignInStep.Password(PasswordNote.PhoneRemoved)
                        PinFailure.Network, null -> Unit
                        else -> gridProblem = f
                    }
                }
        }
    }

    fun open(profile: PhoneProfile) {
        reset()
        step = if (profile.hasPin) SignInStep.Pin(profile.uid) else SignInStep.Password(PasswordNote.ChoosePin)
    }

    fun digit(d: Char) {
        if (busy || pin.length >= PinRules.MAX) return
        failure = null
        pin += d
    }

    fun backspace() {
        if (!busy) pin = pin.dropLast(1)
    }

    fun submit() {
        val uid = (step as? SignInStep.Pin)?.uid ?: return
        if (busy || pin.isEmpty()) return
        val typed = pin
        busy = true
        viewModelScope.launch {
            phone.signInWithPin(uid, typed)
                .onSuccess { reset(); step = SignInStep.Grid } // the session takes over from here
                .onFailure { e ->
                    pin = ""
                    when (val f = (e as? PinException)?.failure ?: PinFailure.Unknown(e.message)) {
                        PinFailure.NoPin -> step = SignInStep.Password(PasswordNote.ChoosePin)
                        PinFailure.PhoneRemoved -> step = SignInStep.Password(PasswordNote.PhoneRemoved)
                        PinFailure.NotOnPhone, PinFailure.Gone -> step = SignInStep.Password(PasswordNote.NotOnPhone).also { refresh() }
                        else -> {
                            failure = f
                            if (f is PinFailure.WrongPin || f is PinFailure.Locked) shakes++
                        }
                    }
                }
            busy = false
        }
    }

    fun useFingerprint(activity: FragmentActivity, title: String, subtitle: String, cancel: String) {
        val uid = (step as? SignInStep.Pin)?.uid ?: return
        val fp = fingerprint ?: return
        if (busy) return
        busy = true
        failure = null
        fingerprintChanged = false
        viewModelScope.launch {
            when (val r = fp.signIn(activity, uid, title, subtitle, cancel)) {
                Fingerprint.Result.Done -> { reset(); step = SignInStep.Grid }
                Fingerprint.Result.Cancelled -> Unit
                Fingerprint.Result.Changed -> fingerprintChanged = true
                is Fingerprint.Result.Refused -> failure = r.failure
            }
            busy = false
        }
    }

    fun usePassword() {
        reset()
        step = SignInStep.Password(null)
    }

    fun addAccount() {
        reset()
        step = SignInStep.Password(PasswordNote.AddProfile)
    }

    fun back() {
        reset()
        step = SignInStep.Grid
        refresh()
    }

    fun forget(uid: String) {
        viewModelScope.launch { phone.forget(uid).onFailure { gridProblem = (it as? PinException)?.failure } }
    }

    private fun reset() {
        pin = ""
        failure = null
        fingerprintChanged = false
    }
}

/**
 * Signed out: the grid of profiles on this phone (name and icon or picture only), a PIN pad per
 * profile, and the password form for "Add / other account", a profile without a PIN, or a phone
 * with no profiles yet.
 */
@Composable
fun SignInScreen(phone: PhoneRepository, sessions: SessionRepository, fingerprint: Fingerprint?) {
    val vm = viewModel { SignInViewModel(phone, fingerprint) }
    val profiles by phone.profiles.collectAsStateWithLifecycle()
    val photos by phone.photos.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.refresh() }
    val step = vm.step
    BackHandler(enabled = step != SignInStep.Grid && profiles.isNotEmpty()) { vm.back() }

    when {
        step is SignInStep.Password || profiles.isEmpty() ->
            LoginScreen(sessions, note = (step as? SignInStep.Password)?.note, onBack = if (profiles.isEmpty()) null else vm::back)
        step is SignInStep.Pin -> {
            val profile = profiles.firstOrNull { it.uid == step.uid }
            val withFingerprint = profile != null && profile.biometric && fingerprint != null && fingerprint.isAvailable && fingerprint.isOn(profile.uid)
            if (profile == null) LaunchedEffect(Unit) { vm.back() } else PinScreen(vm, profile, photos[profile.uid], withFingerprint)
        }
        else -> ProfileGrid(profiles, photos, vm.gridProblem, onOpen = vm::open, onAdd = vm::addAccount, onForget = vm::forget)
    }
}

/** The current time, ticking every second until [untilMs] (a lock's end); still otherwise. */
@Composable
fun rememberNowUntil(untilMs: Long?): Long {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(untilMs) {
        now = System.currentTimeMillis()
        while (untilMs != null && now < untilMs) {
            delay(1_000)
            now = System.currentTimeMillis()
        }
    }
    return now
}

@Composable
private fun ProfileGrid(
    profiles: List<PhoneProfile>,
    photos: Map<String, ImageBitmap>,
    problem: PinFailure?,
    onOpen: (PhoneProfile) -> Unit,
    onAdd: () -> Unit,
    onForget: (String) -> Unit,
) {
    val now = rememberNowUntil(profiles.mapNotNull { it.lockedUntilMs }.maxOrNull())
    var forgetting by remember { mutableStateOf<PhoneProfile?>(null) }
    Column(Modifier.fillMaxSize().padding(horizontal = Spacing.xl), horizontalAlignment = Alignment.CenterHorizontally) {
        BrandHeader(Modifier.padding(top = Spacing.hero, bottom = Spacing.xxl))
        Text(stringResource(R.string.who_is_working).caps(), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
        problem?.let {
            Text(pinFailureMessage(it, now), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center, modifier = Modifier.padding(top = Spacing.m))
        }
        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 120.dp),
            modifier = Modifier.weight(1f).fillMaxWidth().padding(top = Spacing.xxl),
            contentPadding = PaddingValues(bottom = Spacing.xxxl),
            horizontalArrangement = Arrangement.spacedBy(Spacing.m),
            verticalArrangement = Arrangement.spacedBy(Spacing.xl),
        ) {
            items(profiles, key = { it.uid }) { p ->
                ProfileTile(p, photos[p.uid], now, onClick = { onOpen(p) }, onLongClick = { forgetting = p })
            }
            item(key = "add") { AddTile(onAdd) }
        }
    }
    forgetting?.let { p ->
        AlertDialog(
            onDismissRequest = { forgetting = null },
            title = { Text(stringResource(R.string.remove_from_phone_title, p.displayName)) },
            text = { Text(stringResource(R.string.remove_from_phone_body)) },
            confirmButton = { TextButton(onClick = { onForget(p.uid); forgetting = null }) { Text(stringResource(R.string.remove)) } },
            dismissButton = { TextButton(onClick = { forgetting = null }) { Text(stringResource(R.string.dialog_cancel)) } },
        )
    }
}

@Composable
private fun ProfileTile(profile: PhoneProfile, photo: ImageBitmap?, now: Long, onClick: () -> Unit, onLongClick: () -> Unit) {
    val lockedUntil = profile.lockedUntilMs?.takeIf { it > now }
    Column(
        Modifier.combinedClickable(onClick = onClick, onLongClick = onLongClick, onLongClickLabel = stringResource(R.string.remove)).padding(Spacing.s),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        ProfileAvatar(profile.icon, photo, 96.dp)
        Text(
            profile.displayName,
            style = MaterialTheme.typography.titleMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = Spacing.s),
        )
        when {
            lockedUntil != null -> Text(stringResource(R.string.pin_locked_short, countdown(lockedUntil - now)), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
            !profile.hasPin -> Text(stringResource(R.string.pin_password_needed), style = MaterialTheme.typography.labelSmall, color = BarLabColors.Muted)
        }
    }
}

@Composable
private fun AddTile(onClick: () -> Unit) {
    Column(Modifier.combinedClickable(onClick = onClick).padding(Spacing.s), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(96.dp).border(1.dp, BarLabColors.Line), contentAlignment = Alignment.Center) {
            Text("+", style = MaterialTheme.typography.displaySmall, color = BarLabColors.Muted)
        }
        Text(
            stringResource(R.string.add_account),
            style = MaterialTheme.typography.bodyMedium,
            color = BarLabColors.Muted,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = Spacing.s),
        )
    }
}

@Composable
private fun PinScreen(vm: SignInViewModel, profile: PhoneProfile, photo: ImageBitmap?, withFingerprint: Boolean) {
    val now = rememberNowUntil(profile.lockedUntilMs)
    val lockedUntil = profile.lockedUntilMs?.takeIf { it > now }
    val message = when {
        lockedUntil != null -> stringResource(R.string.pin_locked, countdown(lockedUntil - now))
        vm.fingerprintChanged -> stringResource(R.string.biometric_changed)
        else -> vm.failure?.let { pinFailureMessage(it, now) }
    }
    val activity = LocalActivity.current as? FragmentActivity
    val promptTitle = stringResource(R.string.biometric_prompt_unlock, profile.displayName)
    val promptSubtitle = stringResource(R.string.brand_wordmark)
    val promptCancel = stringResource(R.string.biometric_use_pin)
    val touch = { activity?.let { vm.useFingerprint(it, promptTitle, promptSubtitle, promptCancel) } }
    // With fingerprint unlock on, ask for the finger straight away; the PIN pad stays underneath.
    LaunchedEffect(profile.uid, withFingerprint) { if (withFingerprint) touch() }
    Column(Modifier.fillMaxSize().padding(horizontal = Spacing.xl, vertical = Spacing.m), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(Modifier.fillMaxWidth()) {
            TextButton(onClick = vm::back) { Text("‹ " + stringResource(R.string.back_to_profiles)) }
        }
        Spacer(Modifier.weight(1f))
        ProfileAvatar(profile.icon, photo, 88.dp)
        Text(profile.displayName, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = Spacing.m))
        Text(stringResource(R.string.pin_enter_hint), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary)
        PinDots(vm.pin.length, minDots = PinRules.SERVER_MIN, shakeKey = vm.shakes, error = message != null, modifier = Modifier.padding(top = Spacing.xxl))
        Box(Modifier.heightIn(min = 56.dp).padding(top = Spacing.m), contentAlignment = Alignment.TopCenter) {
            message?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center) }
        }
        if (withFingerprint) {
            OutlinedButton(onClick = { touch() }, enabled = !vm.busy) {
                Icon(painterResource(R.drawable.ic_fingerprint), contentDescription = null, tint = BarLabColors.Gold, modifier = Modifier.size(22.dp))
                Text(stringResource(R.string.biometric_use), modifier = Modifier.padding(start = Spacing.s))
            }
        }
        Spacer(Modifier.weight(1f))
        Box(Modifier.heightIn(min = 4.dp).fillMaxWidth()) { if (vm.busy) LinearProgressIndicator(Modifier.fillMaxWidth()) }
        PinKeypad(
            enabled = !vm.busy && lockedUntil == null,
            onDigit = vm::digit,
            onBackspace = vm::backspace,
            onSubmit = vm::submit,
            deleteLabel = stringResource(R.string.pin_delete),
            enterLabel = stringResource(R.string.sign_in),
            modifier = Modifier.padding(top = Spacing.m),
        )
        TextButton(onClick = vm::usePassword, modifier = Modifier.padding(top = Spacing.s)) { Text(stringResource(R.string.pin_use_password)) }
    }
}
