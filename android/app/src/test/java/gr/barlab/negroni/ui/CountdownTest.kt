package gr.barlab.negroni.ui

import gr.barlab.negroni.ui.auth.countdown
import org.junit.Assert.assertEquals
import org.junit.Test

class CountdownTest {
    @Test fun minutesAndSeconds() = assertEquals("4:05", countdown(245_000))
    @Test fun roundsUpSoItNeverShowsZeroEarly() = assertEquals("0:01", countdown(1))
    @Test fun anHourLock() = assertEquals("60:00", countdown(3_600_000))
    @Test fun pastIsZero() = assertEquals("0:00", countdown(-5_000))
}
