package gr.barlab.negroni.auth

import android.content.Context
import android.graphics.BitmapFactory
import android.os.Build
import android.util.Log
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.core.content.edit
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.FirebaseFunctionsException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.util.Base64

/**
 * This phone's sign-in grid and PIN sign-in (server side: functions/src/devices.ts and pins.ts).
 *
 * A phone is registered by the first password sign-in on it ([register]); from then on every
 * profile that has signed in here with a password is on the grid. A PIN goes to the server with
 * the phone key ([PhoneKey]); the server answers with a custom token for Firebase Auth.
 */
class PhoneRepository(
    context: Context,
    private val key: PhoneKey,
    private val device: DeviceLogin,
    private val auth: FirebaseAuth,
    private val functions: FirebaseFunctions,
) {
    private val prefs = context.getSharedPreferences("profiles", Context.MODE_PRIVATE)
    private val photoDir = File(context.filesDir, "avatars")

    private val _profiles = MutableStateFlow(ProfileListFormat.decode(prefs.getString(KEY_LIST, null)))
    /** The grid, in the order people first signed in here. Saved: only id, name, icon, picture version. */
    val profiles: StateFlow<List<PhoneProfile>> = _profiles.asStateFlow()

    private val _photos = MutableStateFlow<Map<String, ImageBitmap>>(emptyMap())
    val photos: StateFlow<Map<String, ImageBitmap>> = _photos.asStateFlow()

    /** Phone id, shown to the admin to recognise this phone in the list. */
    val deviceId: String? get() = key.deviceId

    /** Updates the grid from the server (names, icons, pictures, PIN state). Offline: keeps the saved grid. */
    suspend fun refresh(): Result<Unit> = attempt {
        if (_photos.value.isEmpty()) loadPhotos()
        val creds = key.credentials ?: return@attempt store(emptyList())
        val known = _profiles.value.mapNotNull { p -> p.photoVersion?.let { p.uid to it } }.toMap()
        val data = call("deviceProfiles", creds.args() + ("photos" to known))
        val list = (data["profiles"] as? List<*>).orEmpty().mapNotNull { it as? Map<*, *> }.map { entry ->
            val profile = PhoneProfile(
                uid = entry["uid"] as String,
                displayName = entry["displayName"] as? String ?: "",
                icon = entry["icon"] as? String ?: "person",
                photoVersion = (entry["photoVersion"] as? Number)?.toLong(),
                hasPin = entry["hasPin"] as? Boolean ?: false,
                lockedUntilMs = (entry["lockedUntilMs"] as? Number)?.toLong(),
                biometric = entry["biometric"] as? Boolean ?: false,
            )
            (entry["photo"] as? String)?.let { savePhoto(profile.uid, Base64.getDecoder().decode(it)) }
            profile
        }
        store(list)
    }

    /**
     * Right after a password sign-in: registers this phone (the first time) and puts the signed-in
     * person on its grid. The server also clears their wrong-PIN count.
     */
    suspend fun register(): Result<Unit> = attempt {
        val args = buildMap<String, Any> {
            put("name", phoneName())
            key.credentials?.let { putAll(it.args()) }
        }
        val data = call("registerDevice", args)
        key.save(data["deviceId"] as String, data["deviceSecret"] as? String)
    }

    suspend fun signInWithPin(uid: String, pin: String): Result<Unit> = signIn(uid, mapOf("pin" to pin))

    /** Fingerprint unlock: [secret] is what the fingerprint unlocked (see BiometricUnlock). */
    suspend fun signInWithBiometric(uid: String, secret: String): Result<Unit> = signIn(uid, mapOf("biometricSecret" to secret))

    private suspend fun signIn(uid: String, proof: Map<String, String>): Result<Unit> = attempt {
        val creds = key.credentials ?: throw PinException(PinFailure.PhoneRemoved)
        val token = call("profileSignIn", creds.args() + ("uid" to uid) + proof)["token"] as String
        // The shift must be stored before the sign-in lands (see DeviceLogin.startShift).
        device.startShift()
        auth.signInWithCustomToken(token).await()
        _profiles.update { list -> list.map { if (it.uid == uid) it.copy(lockedUntilMs = null) else it } }
    }.onFailure { e ->
        val failure = (e as? PinException)?.failure
        val until = when (failure) {
            is PinFailure.WrongPin -> failure.lockedUntilMs
            is PinFailure.Locked -> failure.untilMs
            else -> null
        }
        if (until != null) _profiles.update { list -> list.map { if (it.uid == uid) it.copy(lockedUntilMs = until) else it } }
        if (failure == PinFailure.NoPin) _profiles.update { list -> list.map { if (it.uid == uid) it.copy(hasPin = false) else it } }
    }

    /** "Remove from this phone": the profile leaves the grid (it can come back with a password sign-in). */
    suspend fun forget(uid: String): Result<Unit> = attempt {
        key.credentials?.let { call("forgetProfile", it.args() + ("uid" to uid)) }
        store(_profiles.value.filterNot { it.uid == uid })
    }

    /** Chooses or changes the signed-in person's PIN. Changing needs [currentPin]. */
    suspend fun setPin(pin: String, currentPin: String? = null): Result<Unit> = attempt {
        call("setPin", buildMap { put("pin", pin); currentPin?.let { put("currentPin", it) } })
    }

    /** Turns fingerprint unlock on (returns the secret to keep behind the fingerprint) or off. */
    suspend fun setBiometric(on: Boolean): Result<String?> = attempt {
        val creds = key.credentials ?: throw PinException(PinFailure.PhoneRemoved)
        call("setBiometric", creds.args() + ("on" to on))["secret"] as? String
    }

    private fun PhoneKey.Credentials.args() = mapOf("deviceId" to deviceId, "deviceSecret" to deviceSecret)

    private suspend fun call(name: String, args: Map<String, Any>): Map<*, *> =
        functions.getHttpsCallable(name).call(args).await().getData() as? Map<*, *> ?: emptyMap<String, Any>()

    /** Runs [block], turning every error into a [PinException]; a removed phone forgets its key and grid. */
    private suspend fun <T> attempt(block: suspend () -> T): Result<T> = runCatching { block() }.recoverCatching { e ->
        val failure = when (e) {
            is PinException -> e.failure
            is FirebaseFunctionsException -> PinFailure.from(e.code.name, e.details, e.message)
            is FirebaseNetworkException, is IOException -> PinFailure.Network
            else -> PinFailure.Unknown(e.message ?: e.javaClass.simpleName)
        }
        if (failure is PinFailure.Unknown || failure == PinFailure.Network) Log.w(TAG, "PIN step failed ($failure)", e)
        if (failure == PinFailure.PhoneRemoved) forgetPhone()
        throw PinException(failure)
    }

    private suspend fun forgetPhone() {
        key.clear()
        store(emptyList())
    }

    private suspend fun store(list: List<PhoneProfile>) {
        _profiles.value = list
        prefs.edit { putString(KEY_LIST, ProfileListFormat.encode(list)) }
        // Pictures of profiles that left the grid, or that went back to an icon.
        val keep = list.filter { it.photoVersion != null }.map { it.uid }.toSet()
        withContext(Dispatchers.IO) { photoDir.listFiles()?.filter { it.name !in keep }?.forEach { it.delete() } }
        _photos.update { it.filterKeys(keep::contains) }
    }

    private suspend fun savePhoto(uid: String, bytes: ByteArray) = withContext(Dispatchers.IO) {
        photoDir.mkdirs()
        File(photoDir, uid).writeBytes(bytes)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()?.let { bitmap -> _photos.update { it + (uid to bitmap) } }
    }

    private suspend fun loadPhotos() = withContext(Dispatchers.IO) {
        val loaded = photoDir.listFiles().orEmpty().mapNotNull { f ->
            BitmapFactory.decodeFile(f.path)?.asImageBitmap()?.let { f.name to it }
        }.toMap()
        _photos.value = loaded
    }

    private fun phoneName(): String {
        val maker = Build.MANUFACTURER.replaceFirstChar { it.uppercase() }
        return if (Build.MODEL.startsWith(maker, ignoreCase = true)) Build.MODEL else "$maker ${Build.MODEL}"
    }

    private companion object {
        const val KEY_LIST = "list"
        const val TAG = "NegroniPin"
    }
}
