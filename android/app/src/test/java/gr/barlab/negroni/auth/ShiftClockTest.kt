package gr.barlab.negroni.auth

import java.time.LocalDateTime
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Test

// Same cases as web/src/domain/shift.test.ts.
class ShiftClockTest {
    private val athens = ZoneId.of("Europe/Athens")
    private fun at(d: Int, h: Int, m: Int = 0) = LocalDateTime.of(2026, 11, d, h, m).atZone(athens).toInstant().toEpochMilli()

    @Test fun eveningAndNightAreOneShift() {
        assertEquals("2026-11-11", ShiftClock.key(at(11, 18), athens))
        assertEquals("2026-11-11", ShiftClock.key(at(12, 2), athens))
        assertEquals("2026-11-11", ShiftClock.key(at(12, 17, 59), athens))
        assertEquals("2026-11-12", ShiftClock.key(at(12, 18), athens))
    }

    @Test fun endsAtTheNext1800() {
        assertEquals(at(12, 18), ShiftClock.end(at(11, 20), athens))
        assertEquals(at(12, 18), ShiftClock.end(at(12, 3), athens))
        assertEquals(at(13, 18), ShiftClock.end(at(12, 18), athens))
    }

    @Test fun crossesMonthEnds() =
        assertEquals("2026-11-30", ShiftClock.key(LocalDateTime.of(2026, 12, 1, 1, 0).atZone(athens).toInstant().toEpochMilli(), athens))

    // Same cases as web/src/domain/shift.test.ts "denials".
    @Test fun firstDenialCountsOne() = assertEquals(ShiftClock.Denial(1, null), ShiftClock.afterDenial(0, null, at(11, 20), athens))

    @Test fun secondInTheSameShiftBlocksUntil1800() =
        assertEquals(ShiftClock.Denial(2, at(12, 18)), ShiftClock.afterDenial(1, at(11, 20), at(12, 1), athens))

    @Test fun denialFromAnEarlierShiftDoesNotCount() {
        assertEquals(ShiftClock.Denial(1, null), ShiftClock.afterDenial(1, at(10, 23), at(11, 20), athens))
        assertEquals(0, ShiftClock.denialsThisShift(1, at(10, 23), at(11, 20), athens))
    }
}
