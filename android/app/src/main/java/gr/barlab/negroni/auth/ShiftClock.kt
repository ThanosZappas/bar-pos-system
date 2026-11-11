package gr.barlab.negroni.auth

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Shifts change at 18:00 local time. A login lasts until the next 18:00, and so does a server's
 * permission to work. Mirrors web/src/domain/shift.ts (same test cases).
 */
object ShiftClock {
    const val CHANGE_HOUR = 18

    /** "2026-11-11" for the shift that started at 18:00 on 11 November (18:00 → 17:59 next day). */
    fun key(ms: Long, zone: ZoneId = ZoneId.systemDefault()): String {
        val t = Instant.ofEpochMilli(ms).atZone(zone)
        val day: LocalDate = if (t.hour < CHANGE_HOUR) t.toLocalDate().minusDays(1) else t.toLocalDate()
        return day.toString()
    }

    /** The next 18:00 after [ms], in epoch milliseconds: when the current shift ends. */
    fun end(ms: Long, zone: ZoneId = ZoneId.systemDefault()): Long {
        val t = Instant.ofEpochMilli(ms).atZone(zone)
        var end = t.toLocalDate().atTime(CHANGE_HOUR, 0).atZone(zone)
        if (!t.isBefore(end)) end = end.plusDays(1)
        return end.toInstant().toEpochMilli()
    }

    /** Two denials in a row block a server from asking again until the shift ends (18:00). */
    const val MAX_DENIALS = 2

    data class Denial(val denials: Int, val blockedUntilMs: Long?)

    /**
     * What a denial at [nowMs] writes. Denials count only within the same shift (by the time of the
     * last denial, stamped by the server clock, so a server cannot reset it); the second blocks
     * until the next 18:00. Same as web/src/domain/shift.ts.
     */
    fun afterDenial(previousDenials: Int, lastDeniedAtMs: Long?, nowMs: Long, zone: ZoneId = ZoneId.systemDefault()): Denial {
        val sameShift = lastDeniedAtMs != null && key(lastDeniedAtMs, zone) == key(nowMs, zone)
        val denials = (if (sameShift) previousDenials else 0) + 1
        return Denial(denials, if (denials >= MAX_DENIALS) end(nowMs, zone) else null)
    }

    /** Denials so far in this shift (0 after an approval, an unblock, or a new shift). */
    fun denialsThisShift(denials: Int, lastDeniedAtMs: Long?, nowMs: Long, zone: ZoneId = ZoneId.systemDefault()): Int =
        if (lastDeniedAtMs != null && key(lastDeniedAtMs, zone) == key(nowMs, zone)) denials else 0
}
