package gr.barlab.negroni.shift

import gr.barlab.negroni.auth.StaffUser

/** A server's permission to work this shift (shifts/{uid}). */
data class Shift(
    val uid: String,
    val displayName: String,
    val shiftDay: String,
    val status: Status,
    val requestedAtMs: Long?,
    val decidedByName: String?,
    val approvedUntilMs: Long?,
    val pendingSync: Boolean = false,
    val denials: Int = 0,
    val lastDeniedAtMs: Long? = null,
    val blockedUntilMs: Long? = null,
) {
    enum class Status(val wire: String) {
        Requested("requested"), Approved("approved"), Denied("denied"), Revoked("revoked"), Cleared("cleared");

        companion object {
            fun fromWire(value: String?) = entries.firstOrNull { it.wire == value }
        }
    }

    fun approvedAt(nowMs: Long): Boolean = status == Status.Approved && (approvedUntilMs ?: 0) > nowMs

    /** Two "Not now" in a row: no more requests until the block runs out (18:00) or is cleared. */
    fun blockedAt(nowMs: Long): Boolean = (blockedUntilMs ?: 0) > nowMs

    fun denialsThisShift(nowMs: Long): Int = gr.barlab.negroni.auth.ShiftClock.denialsThisShift(denials, lastDeniedAtMs, nowMs)
}

object ShiftAccess {
    /**
     * May this person take orders, payments and so on right now? Barman and admin always; trusted
     * servers always; others with an approval that has not run out (it ends at 18:00).
     */
    fun canWork(user: StaffUser, shift: Shift?, nowMs: Long): Boolean =
        user.isLead || user.rights.noApproval || (shift != null && shift.uid == user.uid && shift.approvedAt(nowMs))
}
