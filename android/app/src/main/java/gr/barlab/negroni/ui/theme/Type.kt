package gr.barlab.negroni.ui.theme

import android.content.res.Resources
import android.graphics.Typeface
import android.graphics.fonts.Font
import android.graphics.fonts.FontStyle
import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import gr.barlab.negroni.R
import android.graphics.fonts.FontFamily as PlatformFontFamily
import androidx.compose.ui.text.font.Font as ComposeFont
import androidx.compose.ui.text.font.Typeface as ComposeTypeface

/**
 * The site's fonts (Lato, Playfair Display, Dancing Script) have no Greek letters. Each weight is
 * therefore a platform typeface whose Latin comes from the site's font and whose Greek comes from
 * a Greek-only subset of a matching font: Commissioner under Lato (same x-height, same light
 * feel) and Noto Serif Display under Playfair (same high contrast). Android picks per letter, so
 * mixed text such as "Τσίπουρο Αγιονερίου · Gin" keeps the brand look. See design/tokens.md.
 */
class BarLabFonts(private val resources: Resources) {
    private fun withGreek(latin: Int, greek: Int, weight: Int): FontFamily {
        fun family(res: Int) = PlatformFontFamily.Builder(Font.Builder(resources, res).setWeight(weight).build()).build()
        val typeface = Typeface.CustomFallbackBuilder(family(latin))
            .addCustomFallback(family(greek))
            .setStyle(FontStyle(weight, FontStyle.FONT_SLANT_UPRIGHT))
            .build()
        return FontFamily(ComposeTypeface(typeface))
    }

    val sansLight = withGreek(R.font.lato_light, R.font.commissioner_greek_light, 300)
    val sans = withGreek(R.font.lato_regular, R.font.commissioner_greek_regular, 400)
    val sansBold = withGreek(R.font.lato_bold, R.font.commissioner_greek_bold, 700)
    val serif = withGreek(R.font.playfair_display_regular, R.font.noto_serif_display_greek_regular, 400)
    val serifBold = withGreek(R.font.playfair_display_bold, R.font.noto_serif_display_greek_bold, 700)

    /** Brand wordmark only (Latin). */
    val script = FontFamily(ComposeFont(R.font.dancing_script_semibold, FontWeight.SemiBold))
}

// letterSpacing in px from the site converted to em at the given size.
private fun spacing(px: Float, sizePx: Float) = (px / sizePx).em

// Site sizes are for desktop reading; phone sizes are scaled up slightly for a bar environment.
fun barLabTypography(f: BarLabFonts) = Typography(
    displayLarge = TextStyle(fontFamily = f.script, fontWeight = FontWeight.SemiBold, fontSize = 52.sp, lineHeight = 52.sp),
    displayMedium = TextStyle(fontFamily = f.script, fontWeight = FontWeight.SemiBold, fontSize = 38.sp, lineHeight = 38.sp),
    headlineSmall = TextStyle(fontFamily = f.script, fontWeight = FontWeight.SemiBold, fontSize = 28.sp, lineHeight = 28.sp),
    titleLarge = TextStyle(fontFamily = f.serif, fontSize = 22.sp),
    titleMedium = TextStyle(fontFamily = f.serif, fontSize = 17.sp), // .item-name
    titleSmall = TextStyle(fontFamily = f.serif, fontSize = 12.sp, letterSpacing = spacing(3f, 11f)), // .cat-line p (uppercase in UI)
    bodyLarge = TextStyle(fontFamily = f.sansLight, fontWeight = FontWeight.Light, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = f.sansLight, fontWeight = FontWeight.Light, fontSize = 14.sp, lineHeight = 22.sp, letterSpacing = spacing(0.3f, 13.5f)), // .item-desc
    bodySmall = TextStyle(fontFamily = f.sansLight, fontWeight = FontWeight.Light, fontSize = 12.sp),
    labelLarge = TextStyle(fontFamily = f.sans, fontWeight = FontWeight.Normal, fontSize = 13.sp, letterSpacing = spacing(2f, 11f)), // .tab-btn
    labelMedium = TextStyle(fontFamily = f.sans, fontWeight = FontWeight.Normal, fontSize = 11.sp, letterSpacing = spacing(4f, 11f)), // .hero-sub
    labelSmall = TextStyle(fontFamily = f.sans, fontWeight = FontWeight.Normal, fontSize = 10.sp, letterSpacing = spacing(1f, 9f)), // .badge
)
