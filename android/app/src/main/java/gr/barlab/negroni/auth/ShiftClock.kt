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
}
