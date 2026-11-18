package gr.barlab.negroni.auth

import android.content.Context
import androidx.core.content.edit

/**
 * Today's sign-ins on this phone: after a PIN, fingerprint or password sign-in the server gives the
 * phone a ticket for that person, valid until the next 18:00 (worker/src/devices.ts). Choosing the
 * profile again from the grid that day signs in with the ticket instead of asking for the PIN.
 * Tickets are stored encrypted with a Keystore key, like the phone key ([PhoneKey]).
 */
class ShiftTickets(context: Context) {
    private val prefs = context.getSharedPreferences("tickets", Context.MODE_PRIVATE)
    private val box = KeystoreBox("negroni-ticket-key")

    fun save(uid: String, ticket: String, untilMs: Long) = prefs.edit { putString(uid, box.seal("$ticket\n$untilMs".toByteArray(Charsets.UTF_8))) }

    /** The ticket for [uid] if it is still valid at [nowMs]. */
    fun valid(uid: String, nowMs: Long = System.currentTimeMillis()): String? {
        val sealed = prefs.getString(uid, null) ?: return null
        val parsed = runCatching { String(box.open(sealed), Charsets.UTF_8).split('\n') }.getOrNull()
        val until = parsed?.getOrNull(1)?.toLongOrNull()
        if (parsed == null || until == null || until <= nowMs) {
            forget(uid)
            return null
        }
        return parsed[0]
    }

    fun forget(uid: String) = prefs.edit { remove(uid) }

    fun clear() = prefs.edit { clear() }
}
