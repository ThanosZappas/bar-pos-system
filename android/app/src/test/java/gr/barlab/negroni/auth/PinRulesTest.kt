package gr.barlab.negroni.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PinRulesTest {
    @Test fun serversNeedFourToEightDigits() {
        assertEquals(4, PinRules.minLength(Role.Server))
        assertTrue(PinRules.isValid("1234", Role.Server))
        assertTrue(PinRules.isValid("12345678", Role.Server))
        assertFalse(PinRules.isValid("123", Role.Server))
        assertFalse(PinRules.isValid("123456789", Role.Server))
    }

    @Test fun adminAndBarmanNeedSix() {
        assertFalse(PinRules.isValid("12345", Role.Admin))
        assertFalse(PinRules.isValid("12345", Role.Barman))
        assertTrue(PinRules.isValid("123456", Role.Admin))
    }

    @Test fun anyDigitsAreAllowedButOnlyDigits() {
        for (pin in listOf("0000", "1111", "1234", "9876")) assertTrue(pin, PinRules.isValid(pin, Role.Server))
        for (pin in listOf("12a4", "12 4", "١٢٣٤")) assertFalse(pin, PinRules.isValid(pin, Role.Server))
    }
}
