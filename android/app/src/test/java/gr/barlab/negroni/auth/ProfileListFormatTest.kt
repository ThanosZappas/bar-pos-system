package gr.barlab.negroni.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class ProfileListFormatTest {
    private val maria = PhoneProfile("u1", "Μαρία", "martini", photoVersion = 1_700_000_000_000)
    private val nikos = PhoneProfile("u2", "Nikos", "person")

    @Test fun roundTrips() = assertEquals(listOf(maria, nikos), ProfileListFormat.decode(ProfileListFormat.encode(listOf(maria, nikos))))

    @Test fun storesOnlyIdNameIconAndPictureVersion() {
        val locked = maria.copy(hasPin = false, lockedUntilMs = 123, biometric = true)
        val text = ProfileListFormat.encode(listOf(locked))
        assertEquals("u1\tΜαρία\tmartini\t1700000000000", text)
        assertEquals(listOf(maria), ProfileListFormat.decode(text)) // the rest comes from the server
    }

    @Test fun namesCannotBreakTheFormat() {
        val odd = PhoneProfile("u3", "A\tB\nC", "star")
        assertEquals(listOf(odd.copy(displayName = "A B C")), ProfileListFormat.decode(ProfileListFormat.encode(listOf(odd))))
    }

    @Test fun emptyOrDamagedInputGivesWhatCanBeRead() {
        assertEquals(emptyList<PhoneProfile>(), ProfileListFormat.decode(null))
        assertEquals(emptyList<PhoneProfile>(), ProfileListFormat.decode(""))
        assertEquals(listOf(nikos), ProfileListFormat.decode("garbage\nu2\tNikos\tperson\t"))
        assertFalse(ProfileListFormat.encode(listOf(maria)).contains("token"))
    }
}
