package gr.barlab.negroni.ui

import gr.barlab.negroni.profile.PhotoShrinker
import org.junit.Assert.assertEquals
import org.junit.Test

class PhotoShrinkerTest {
    @Test fun cropsTheCentreOfAPortraitPhoto() = assertEquals(Triple(0, 500, 3000), PhotoShrinker.centerSquare(3000, 4000))
    @Test fun cropsTheCentreOfALandscapePhoto() = assertEquals(Triple(500, 0, 3000), PhotoShrinker.centerSquare(4000, 3000))
    @Test fun aSquareStaysWhole() = assertEquals(Triple(0, 0, 256), PhotoShrinker.centerSquare(256, 256))

    @Test fun decodesSmallButNeverUnderTheTarget() {
        assertEquals(8, PhotoShrinker.sampleSize(4000, 3000, 256)) // 3000 / 8 = 375 ≥ 256; / 16 = 187 < 256
        assertEquals(1, PhotoShrinker.sampleSize(300, 300, 256))
        assertEquals(1, PhotoShrinker.sampleSize(100, 100, 256))
    }
}
