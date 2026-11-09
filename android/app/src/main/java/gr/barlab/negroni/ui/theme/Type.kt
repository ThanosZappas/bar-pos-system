package gr.barlab.negroni.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import gr.barlab.negroni.R

val Lato = FontFamily(
    Font(R.font.lato_light, FontWeight.Light),
    Font(R.font.lato_regular, FontWeight.Normal),
    Font(R.font.lato_bold, FontWeight.Bold),
)
val PlayfairDisplay = FontFamily(
    Font(R.font.playfair_display_regular, FontWeight.Normal),
    Font(R.font.playfair_display_bold, FontWeight.Bold),
)
val DancingScript = FontFamily(Font(R.font.dancing_script_semibold, FontWeight.SemiBold))

// letterSpacing in px from the site converted to em at the given size.
private fun spacing(px: Float, sizePx: Float) = (px / sizePx).em

// Site sizes are for desktop reading; phone sizes are scaled up slightly for a bar environment.
val BarLabTypography = Typography(
    displayLarge = TextStyle(fontFamily = DancingScript, fontWeight = FontWeight.SemiBold, fontSize = 52.sp, lineHeight = 52.sp),
    displayMedium = TextStyle(fontFamily = DancingScript, fontWeight = FontWeight.SemiBold, fontSize = 38.sp, lineHeight = 38.sp),
    headlineSmall = TextStyle(fontFamily = DancingScript, fontWeight = FontWeight.SemiBold, fontSize = 28.sp, lineHeight = 28.sp),
    titleLarge = TextStyle(fontFamily = PlayfairDisplay, fontSize = 22.sp),
    titleMedium = TextStyle(fontFamily = PlayfairDisplay, fontSize = 17.sp), // .item-name
    titleSmall = TextStyle(fontFamily = PlayfairDisplay, fontSize = 12.sp, letterSpacing = spacing(3f, 11f)), // .cat-line p (uppercase in UI)
    bodyLarge = TextStyle(fontFamily = Lato, fontWeight = FontWeight.Light, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = Lato, fontWeight = FontWeight.Light, fontSize = 14.sp, lineHeight = 22.sp, letterSpacing = spacing(0.3f, 13.5f)), // .item-desc
    bodySmall = TextStyle(fontFamily = Lato, fontWeight = FontWeight.Light, fontSize = 12.sp),
    labelLarge = TextStyle(fontFamily = Lato, fontWeight = FontWeight.Normal, fontSize = 13.sp, letterSpacing = spacing(2f, 11f)), // .tab-btn
    labelMedium = TextStyle(fontFamily = Lato, fontWeight = FontWeight.Normal, fontSize = 11.sp, letterSpacing = spacing(4f, 11f)), // .hero-sub
    labelSmall = TextStyle(fontFamily = Lato, fontWeight = FontWeight.Normal, fontSize = 10.sp, letterSpacing = spacing(1f, 9f)), // .badge
)
