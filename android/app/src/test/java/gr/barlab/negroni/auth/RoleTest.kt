package gr.barlab.negroni.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RoleTest {
    @Test fun parsesWireValues() = assertEquals(listOf(Role.Admin, Role.Barman, Role.Server), listOf("admin", "barman", "server").map(Role::fromWire))
    @Test fun unknownRoleIsNull() = assertNull(Role.fromWire("owner"))
    @Test fun onlyAdminAndBarmanSeeTheBoard() {
        assertTrue(Role.Admin.seesOrderBoard)
        assertTrue(Role.Barman.seesOrderBoard)
        assertFalse(Role.Server.seesOrderBoard)
    }
}
