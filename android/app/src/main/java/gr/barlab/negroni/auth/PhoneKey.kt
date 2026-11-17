package gr.barlab.negroni.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.core.content.edit
import java.security.KeyStore
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * This phone's identity for PIN sign-in: the id and the random key the server gave it when it
 * was registered (functions/src/devices.ts). The key is stored encrypted with an AES-256-GCM key
 * that lives in the Android Keystore and never leaves it, so a copy of the app's files is not
 * enough to sign in from another phone. (EncryptedSharedPreferences is deprecated; this is the
 * same idea without the library.)
 */
class PhoneKey(context: Context) {
    private val prefs = context.getSharedPreferences("phone", Context.MODE_PRIVATE)

    data class Credentials(val deviceId: String, val deviceSecret: String)

    val credentials: Credentials?
        get() {
            val id = prefs.getString(KEY_ID, null) ?: return null
            val sealed = prefs.getString(KEY_SECRET, null) ?: return null
            val secret = runCatching { String(KeystoreBox(ALIAS).open(sealed), Charsets.UTF_8) }.getOrNull() ?: return null
            return Credentials(id, secret)
        }

    val deviceId: String? get() = prefs.getString(KEY_ID, null)

    fun save(deviceId: String, deviceSecret: String?) = prefs.edit {
        putString(KEY_ID, deviceId)
        if (deviceSecret != null) putString(KEY_SECRET, KeystoreBox(ALIAS).seal(deviceSecret.toByteArray(Charsets.UTF_8)))
    }

    fun clear() = prefs.edit { clear() }

    private companion object {
        const val ALIAS = "negroni-phone-key"
        const val KEY_ID = "deviceId"
        const val KEY_SECRET = "deviceSecret"
    }
}

/** AES-256-GCM with a key kept in the Android Keystore. Sealed values are base64(iv ‖ ciphertext). */
class KeystoreBox(private val alias: String) {
    private fun key(): SecretKey {
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        val spec = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).apply { init(spec) }.generateKey()
    }

    fun seal(plain: ByteArray): String {
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, key()) }
        return Base64.getEncoder().encodeToString(cipher.iv + cipher.doFinal(plain))
    }

    fun open(sealed: String): ByteArray {
        val bytes = Base64.getDecoder().decode(sealed)
        val cipher = Cipher.getInstance(TRANSFORMATION).apply {
            init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, IV_LENGTH))
        }
        return cipher.doFinal(bytes, IV_LENGTH, bytes.size - IV_LENGTH)
    }

    private companion object {
        const val KEYSTORE = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_LENGTH = 12
    }
}
