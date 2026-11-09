package gr.barlab.negroni.auth

import gr.barlab.negroni.auth.AuthFailure.Reason
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PasswordRulesTest {
    private fun check(new: String, confirm: String = new, current: String = "adminadmin") =
        PasswordRules.check(username = "admin", current = current, new = new, confirm = confirm)

    @Test fun acceptsGoodPassword() = assertNull(check("negroni-74"))
    @Test fun acceptsExactlySixCharacters() = assertNull(check("abc123"))
    @Test fun rejectsFiveCharacters() = assertEquals(Reason.PasswordTooShort, check("abc12"))
    @Test fun rejectsMismatch() = assertEquals(Reason.PasswordMismatch, check("negroni-74", "negroni-75"))
    @Test fun rejectsSameAsCurrent() = assertEquals(Reason.PasswordSameAsCurrent, check("secret-1", current = "secret-1"))
    @Test fun rejectsInitialPattern() = assertEquals(Reason.PasswordSameAsInitial, check("adminadmin", current = "temp-pass"))
}
