package gr.barlab.negroni.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class UsernamesTest {
    @Test fun mapsToInternalDomain() = assertEquals("user1@users.negronibarlab.invalid", Usernames.toEmail("user1"))
    @Test fun ignoresCaseAndSpaces() = assertEquals("admin@users.negronibarlab.invalid", Usernames.toEmail("  Admin "))
    @Test fun rejectsInvalid() = assertNull(Usernames.toEmail("a b"))
    @Test fun rejectsTooShort() = assertNull(Usernames.toEmail("ab"))
}
