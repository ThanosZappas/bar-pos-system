package gr.barlab.negroni.shift

import gr.barlab.negroni.auth.DeviceLogin
import gr.barlab.negroni.auth.Rights
import gr.barlab.negroni.auth.Role
import gr.barlab.negroni.auth.ShiftClock
import gr.barlab.negroni.auth.StaffUser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ShiftAccessTest {
    private val now = 1_000_000L
    private val server = StaffUser("s", "user1", "Server 1", Role.Server, mustChangePassword = false)
    private fun shift(status: Shift.Status, until: Long? = null, uid: String = "s") = Shift(uid, "Server 1", "2026-11-11", status, null, "Admin", until)

    @Test fun serverNeedsATodayApproval() {
        assertFalse(ShiftAccess.canWork(server, null, now))
        assertFalse(ShiftAccess.canWork(server, shift(Shift.Status.Requested), now))
        assertTrue(ShiftAccess.canWork(server, shift(Shift.Status.Approved, until = now + 1), now))
    }

    @Test fun approvalRunsOutOrIsTakenBack() {
        assertFalse(ShiftAccess.canWork(server, shift(Shift.Status.Approved, until = now), now))
        assertFalse(ShiftAccess.canWork(server, shift(Shift.Status.Revoked, until = now + 1000), now))
        assertFalse(ShiftAccess.canWork(server, shift(Shift.Status.Approved, until = now + 1, uid = "other"), now))
    }

    @Test fun trustedServersAndLeadsNeverAsk() {
        assertTrue(ShiftAccess.canWork(server.copy(rights = Rights(noApproval = true)), null, now))
        assertTrue(ShiftAccess.canWork(server.copy(role = Role.Barman), null, now))
        assertTrue(ShiftAccess.canWork(server.copy(role = Role.Admin), null, now))
    }

    @Test fun rightsDefaultToTodaysBehaviourAndLeadsHaveAll() {
        assertEquals(Rights(), Rights.from(null))
        assertEquals(Rights(payments = false, noApproval = true), Rights.from(mapOf("payments" to false, "noApproval" to true, "unknown" to true)))
        val limited = server.copy(rights = Rights(payments = false))
        assertFalse(limited.may { it.payments })
        assertTrue(limited.copy(role = Role.Barman).may { it.payments })
    }

    @Test fun loginExpiresAtTheNextShift() {
        val key = ShiftClock.key(now)
        assertFalse(DeviceLogin.isExpired(key, now))
        assertTrue(DeviceLogin.isExpired("2000-01-01", now))
        assertTrue(DeviceLogin.isExpired(null, now)) // logins from before this feature
    }

    @Test fun blockRunsOutAtItsTime() {
        val blocked = shift(Shift.Status.Denied).copy(denials = 2, blockedUntilMs = now + 1)
        assertTrue(blocked.blockedAt(now))
        assertFalse(blocked.blockedAt(now + 1))
    }

    @Test fun signInRightDefaultsToOnAndReadsOff() {
        assertTrue(Rights.from(null).logIn)
        assertFalse(Rights.from(mapOf("logIn" to false)).logIn)
    }
}
