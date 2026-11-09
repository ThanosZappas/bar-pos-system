package gr.barlab.negroni.ui.nav

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ScreenCodecTest {
    @Test fun everyScreenRoundTrips() {
        val screens = listOf(Screen.Home, Screen.Settings, Screen.Table("table-07"), Screen.NewOrder("table-07"))
        assertEquals(screens, screens.map { ScreenCodec.decode(ScreenCodec.encode(it)) })
    }

    @Test fun unknownCodesAreDropped() = assertNull(ScreenCodec.decode("board"))

    @Test fun anEmptyRestoredStackFallsBackToHome() = assertEquals(listOf(Screen.Home), Navigator(emptyList()).stack.toList())
}
