package gr.barlab.negroni.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import androidx.fragment.app.FragmentActivity
import kotlinx.coroutines.suspendCancellableCoroutine
import java.security.KeyStore
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlin.coroutines.resume

/**
 * Fingerprint unlock, an optional shortcut after the PIN (only on a phone with one profile: a
 * fingerprint opens the whole phone). The server gives the phone a random secret
 * (functions/src/devices.ts setBiometric); it is stored encrypted with a Keystore key that can only
 * be used right after a strong biometric check, and that Android destroys when fingerprints are
 * added or removed. A touch decrypts the secret, which then signs in like a PIN.
 */
class BiometricUnlock(context: Context) {
    private val prefs = context.getSharedPreferences("biometric", Context.MODE_PRIVATE)
    private val manager = BiometricManager.from(context)

    /** The phone has a strong biometric (fingerprint) set up. */
    val isAvailable: Boolean get() = manager.canAuthenticate(BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS

    fun isOn(uid: String): Boolean = prefs.contains(uid)

    fun forget(uid: String) = prefs.edit { remove(uid); remove(offeredKey(uid)) }

    /** Offered once per person per phone, after their first PIN. */
    fun wasOffered(uid: String): Boolean = prefs.getBoolean(offeredKey(uid), false)
    fun markOffered(uid: String) = prefs.edit { putBoolean(offeredKey(uid), true) }

    sealed interface Outcome<out T> {
        data class Done<T>(val value: T) : Outcome<T>
        /** The person chose the PIN instead, or cancelled. */
        data object Cancelled : Outcome<Nothing>
        /** Fingerprints changed since it was turned on: the key is gone, the PIN is needed. */
        data object Changed : Outcome<Nothing>
        data class Failed(val message: String) : Outcome<Nothing>
    }

    /** Stores the server's [secret] behind a fingerprint touch. */
    suspend fun store(activity: FragmentActivity, uid: String, secret: String, title: String, cancel: String): Outcome<Unit> {
        val cipher = runCatching {
            Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, freshKey()) }
        }.getOrElse { return Outcome.Failed(it.message ?: it.javaClass.simpleName) }
        return when (val r = prompt(activity, cipher, title, null, cancel)) {
            is Outcome.Done -> {
                val sealed = r.value.iv + r.value.doFinal(secret.toByteArray(Charsets.UTF_8))
                prefs.edit { putString(uid, Base64.getEncoder().encodeToString(sealed)) }
                Outcome.Done(Unit)
            }
            Outcome.Cancelled -> Outcome.Cancelled
            Outcome.Changed -> Outcome.Changed
            is Outcome.Failed -> r
        }
    }

    /** Asks for a fingerprint and returns the stored secret for [uid]. */
    suspend fun unlock(activity: FragmentActivity, uid: String, title: String, subtitle: String?, cancel: String): Outcome<String> {
        val stored = prefs.getString(uid, null)?.let { Base64.getDecoder().decode(it) } ?: return Outcome.Changed
        val cipher = try {
            val key = existingKey() ?: run { forget(uid); return Outcome.Changed }
            Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, stored, 0, IV_LENGTH)) }
        } catch (_: KeyPermanentlyInvalidatedException) {
            forget(uid)
            return Outcome.Changed
        } catch (e: Exception) {
            return Outcome.Failed(e.message ?: e.javaClass.simpleName)
        }
        return when (val r = prompt(activity, cipher, title, subtitle, cancel)) {
            is Outcome.Done -> runCatching { String(r.value.doFinal(stored, IV_LENGTH, stored.size - IV_LENGTH), Charsets.UTF_8) }
                .fold({ Outcome.Done(it) }, { Outcome.Failed(it.message ?: "decrypt") })
            Outcome.Cancelled -> Outcome.Cancelled
            Outcome.Changed -> Outcome.Changed
            is Outcome.Failed -> r
        }
    }

    private suspend fun prompt(activity: FragmentActivity, cipher: Cipher, title: String, subtitle: String?, cancel: String): Outcome<Cipher> =
        suspendCancellableCoroutine { cont ->
            val prompt = BiometricPrompt(
                activity,
                ContextCompat.getMainExecutor(activity),
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        val c = result.cryptoObject?.cipher
                        if (cont.isActive) cont.resume(if (c != null) Outcome.Done(c) else Outcome.Failed("no cipher"))
                    }

                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        if (!cont.isActive) return
                        val cancelled = errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON || errorCode == BiometricPrompt.ERROR_USER_CANCELED || errorCode == BiometricPrompt.ERROR_CANCELED
                        cont.resume(if (cancelled) Outcome.Cancelled else Outcome.Failed(errString.toString()))
                    }
                    // onAuthenticationFailed (a finger not recognised): the prompt itself says so and lets them retry.
                },
            )
            val info = BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .apply { subtitle?.let { setSubtitle(it) } }
                .setNegativeButtonText(cancel)
                .setAllowedAuthenticators(BIOMETRIC_STRONG)
                .build()
            prompt.authenticate(info, BiometricPrompt.CryptoObject(cipher))
            cont.invokeOnCancellation { prompt.cancelAuthentication() }
        }

    private fun existingKey(): SecretKey? = KeyStore.getInstance(KEYSTORE).apply { load(null) }.getKey(ALIAS, null) as? SecretKey

    /** A new key each time fingerprint unlock is turned on. */
    private fun freshKey(): SecretKey {
        val spec = KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true)
            .apply {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                    setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
                } else {
                    @Suppress("DEPRECATION") setUserAuthenticationValidityDurationSeconds(-1)
                }
            }
            .build()
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).apply { init(spec) }.generateKey()
    }

    private companion object {
        const val KEYSTORE = "AndroidKeyStore"
        const val ALIAS = "negroni-biometric"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_LENGTH = 12
        fun offeredKey(uid: String) = "offered:$uid"
    }
}
