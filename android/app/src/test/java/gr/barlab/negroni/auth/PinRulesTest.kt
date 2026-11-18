package gr.barlab.negroni.auth

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PinRulesTest {
    @Test fun exactlyFourDigits() {
        assertTrue(PinRules.isValid("1234"))
        assertFalse(PinRules.isValid("123"))
        assertFalse(PinRules.isValid("12345"))
        assertFalse(PinRules.isValid("123456"))
    }

    @Test fun anyDigitsAreAllowedButOnlyDigits() {
        for (pin in listOf("0000", "1111", "1234", "9876")) assertTrue(pin, PinRules.isValid(pin))
        for (pin in listOf("12a4", "12 4", "١٢٣٤")) assertFalse(pin, PinRules.isValid(pin))
    }
}
