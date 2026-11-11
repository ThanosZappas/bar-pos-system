package gr.barlab.negroni.ui

import gr.barlab.negroni.ui.components.caps
import org.junit.Assert.assertEquals
import org.junit.Test

class CapsTest {
    @Test fun greekDropsTonos() = assertEquals("ΣΥΝΔΕΣΗ", "Σύνδεση".caps())
    @Test fun mixedTonosAndDiaeresis() = assertEquals("ΑΫΠΝΙΑ", "αϋπνία".caps())
    @Test fun englishUnchanged() = assertEquals("SIGN IN", "Sign in".caps())
}
