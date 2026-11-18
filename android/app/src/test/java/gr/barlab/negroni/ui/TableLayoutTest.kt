package gr.barlab.negroni.ui

import gr.barlab.negroni.ui.catalog.fitTables
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.ceil

class TableLayoutTest {
    private fun fits(count: Int, w: Float, h: Float, gap: Float = 8f) {
        val l = fitTables(count, w, h, gap)
        val rows = ceil(count / l.columns.toFloat())
        assertTrue("width", l.columns * l.side + (l.columns - 1) * gap <= w + 0.01f)
        assertTrue("height", rows * l.side + (rows - 1) * gap <= h + 0.01f)
    }

    @Test fun twentyTablesFitAPhoneScreen() {
        val l = fitTables(20, 368f, 600f, 8f)
        assertEquals(4, l.columns)
        assertEquals(86f, l.side, 0.01f)
        fits(20, 368f, 600f)
    }

    @Test fun aWiderScreenGetsMoreColumns() = assertEquals(5, fitTables(20, 700f, 500f, 8f).columns)

    @Test fun everyCountFitsOnScreen() {
        for (n in 1..40) fits(n, 368f, 600f)
    }

    @Test fun aFewTablesDoNotBecomeHuge() = assertEquals(150f, fitTables(2, 368f, 600f, 8f).side, 0.01f)

    @Test fun tooManyTablesKeepAUsableSizeAndScroll() {
        val l = fitTables(200, 368f, 600f, 8f)
        assertTrue(l.side >= 60f)
    }
}
