package gr.barlab.negroni.auth

import android.content.Context
import androidx.core.content.edit

/**
 * The shift a login on this phone belongs to. A login lasts until the next 18:00 (see
 * [ShiftClock]); after that the phone goes back to the profile grid and asks for the PIN again.
 * (No username is kept: the grid shows only names and icons, see [PhoneRepository].)
 */
class DeviceLogin(context: Context) {
    private val prefs = context.getSharedPreferences("login", Context.MODE_PRIVATE).also {
        // Older versions remembered the last username here.
        if (it.contains(KEY_USERNAME)) it.edit { remove(KEY_USERNAME) }
    }

    /**
     * Called just before signing in: the shift must already be stored when the sign-in lands, or the
     * 18:00 check could see a signed-in user with no shift and sign them straight out again.
     */
    fun startShift(nowMs: Long = System.currentTimeMillis()) = prefs.edit { putString(KEY_SHIFT, ShiftClock.key(nowMs)) }

    fun forget() = prefs.edit { remove(KEY_SHIFT) }

    /** True when the stored login is from an earlier shift, or unknown (e.g. an older app version). */
    fun expired(nowMs: Long = System.currentTimeMillis()): Boolean = isExpired(prefs.getString(KEY_SHIFT, null), nowMs)

    companion object {
        private const val KEY_USERNAME = "username"
        private const val KEY_SHIFT = "shift"

        fun isExpired(storedShift: String?, nowMs: Long): Boolean = storedShift != ShiftClock.key(nowMs)
    }
}
