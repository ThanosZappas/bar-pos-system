package gr.barlab.negroni.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.unit.dp

// The site is dark-only, so the app is too.
private val BarLabColorScheme = darkColorScheme(
    primary = BarLabColors.Gold,
    onPrimary = BarLabColors.Bg,
    primaryContainer = BarLabColors.GoldTint,
    onPrimaryContainer = BarLabColors.Gold,
    secondary = BarLabColors.Desc,
    onSecondary = BarLabColors.Bg,
    tertiary = BarLabColors.Slate,
    background = BarLabColors.Bg,
    onBackground = BarLabColors.Text,
    surface = BarLabColors.Bg,
    onSurface = BarLabColors.Text,
    surfaceVariant = BarLabColors.LineFaint,
    onSurfaceVariant = BarLabColors.Muted,
    surfaceContainer = BarLabColors.LineFaint,
    outline = BarLabColors.LineStrong,
    outlineVariant = BarLabColors.Line,
    error = BarLabColors.Error,
    onError = BarLabColors.Text,
)

// No border radius on the site: square corners, 2dp at most.
private val BarLabShapes = Shapes(
    extraSmall = RoundedCornerShape(0.dp),
    small = RoundedCornerShape(2.dp),
    medium = RoundedCornerShape(2.dp),
    large = RoundedCornerShape(2.dp),
    extraLarge = RoundedCornerShape(2.dp),
)

@Composable
fun BarLabTheme(content: @Composable () -> Unit) {
    val resources = LocalResources.current
    val typography = remember(resources) { barLabTypography(BarLabFonts(resources)) }
    MaterialTheme(
        colorScheme = BarLabColorScheme,
        typography = typography,
        shapes = BarLabShapes,
        content = content,
    )
}
