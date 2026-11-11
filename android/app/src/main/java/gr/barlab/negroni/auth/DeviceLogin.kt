package gr.barlab.negroni.auth

import android.content.Context
import androidx.core.content.edit

/**
 * What this phone remembers about logins: the last username (prefilled on the login screen) and
 * the shift a login belongs to. A login lasts until the next 18:00 (see [ShiftClock]); after that
 * the app asks for the password again.
 */
class DeviceLogin(context: Context) {
    private val prefs = context.getSharedPreferences("login", Context.MODE_PRIVATE)

    val lastUsername: String get() = prefs.getString(KEY_USERNAME, "").orEmpty()

    /**
     * Called just before signing in: the shift must already be stored when the sign-in lands, or the
     * 18:00 check could see a signed-in user with no shift and sign them straight out again.
     */
    fun startShift(nowMs: Long = System.currentTimeMillis()) = prefs.edit { putString(KEY_SHIFT, ShiftClock.key(nowMs)) }

    fun rememberUsername(username: String) = prefs.edit { putString(KEY_USERNAME, username) }

    /** Keeps the username for next time; only the shift is forgotten. */
    fun forget() = prefs.edit { remove(KEY_SHIFT) }

    /** True when the stored login is from an earlier shift, or unknown (e.g. an older app version). */
    fun expired(nowMs: Long = System.currentTimeMillis()): Boolean = isExpired(prefs.getString(KEY_SHIFT, null), nowMs)

    companion object {
        private const val KEY_USERNAME = "username"
        private const val KEY_SHIFT = "shift"

        fun isExpired(storedShift: String?, nowMs: Long): Boolean = storedShift != ShiftClock.key(nowMs)
    }
}
