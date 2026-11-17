package gr.barlab.negroni.auth

import org.junit.Assert.assertEquals
import org.junit.Test

class PinFailureTest {
    private fun from(reason: String?, vararg extra: Pair<String, Any>, code: String = "PERMISSION_DENIED") =
        PinFailure.from(code, reason?.let { mapOf("reason" to it) + extra }, "msg")

    @Test fun wrongPinCarriesTriesLeftAndLock() {
        assertEquals(PinFailure.WrongPin(3, null), from("wrongPin", "triesLeft" to 3))
        // Callable results arrive as JSON numbers: Int, Long or Double.
        assertEquals(PinFailure.WrongPin(0, 1_800_000_060_000), from("wrongPin", "triesLeft" to 0.0, "lockedUntilMs" to 1.80000006E12))
    }

    @Test fun lockedSaysUntilWhen() = assertEquals(PinFailure.Locked(1_800_000_000_000), from("locked", "lockedUntilMs" to 1_800_000_000_000L, code = "RESOURCE_EXHAUSTED"))

    @Test fun mapsEveryReason() {
        assertEquals(PinFailure.NoPin, from("noPin"))
        assertEquals(PinFailure.NeedPassword, from("needPassword"))
        assertEquals(PinFailure.CurrentPinNeeded, from("currentPin"))
        assertEquals(PinFailure.BadFormat(6, 8), from("pinFormat", "min" to 6, "max" to 8))
        assertEquals(PinFailure.PhoneRemoved, from("device"))
        assertEquals(PinFailure.NotOnPhone, from("notOnDevice"))
        assertEquals(PinFailure.Deactivated, from("deactivated"))
        assertEquals(PinFailure.LoginNotAllowed, from("loginNotAllowed"))
        assertEquals(PinFailure.Gone, from("gone"))
        assertEquals(PinFailure.BiometricOff, from("biometric"))
        assertEquals(PinFailure.SharedPhone, from("sharedPhone"))
    }

    @Test fun noReasonFallsBackOnTheCode() {
        assertEquals(PinFailure.Network, from(null, code = "UNAVAILABLE"))
        assertEquals(PinFailure.Unknown("msg"), from(null, code = "INTERNAL"))
    }
}
