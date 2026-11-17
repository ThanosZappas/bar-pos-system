package gr.barlab.negroni.ui.auth

import androidx.annotation.DrawableRes
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import gr.barlab.negroni.ui.theme.BarLabColors
import kotlin.math.max

/**
 * One dot per digit typed (at least [minDots], so the row never shows the PIN's length before
 * anything is typed). [shakeKey] going up shakes the row sideways, with a buzz: a wrong PIN.
 */
@Composable
fun PinDots(count: Int, minDots: Int, shakeKey: Int, error: Boolean, modifier: Modifier = Modifier) {
    val shift = remember { Animatable(0f) }
    val haptics = LocalHapticFeedback.current
    LaunchedEffect(shakeKey) {
        if (shakeKey == 0) return@LaunchedEffect
        haptics.performHapticFeedback(HapticFeedbackType.Reject)
        for (x in listOf(-22f, 22f, -16f, 16f, -8f, 8f, 0f)) shift.animateTo(x, tween(durationMillis = 45))
    }
    val color = if (error) BarLabColors.Error else BarLabColors.Gold
    Row(
        modifier.offset { IntOffset(shift.value.dp.roundToPx(), 0) }.height(24.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        repeat(max(minDots, count)) { i ->
            Box(
                Modifier.size(14.dp).border(1.dp, color, CircleShape)
                    .then(if (i < count) Modifier.background(color, CircleShape) else Modifier),
            )
        }
    }
}

/**
 * A large 3×4 keypad for one hand in a dark bar: digits, delete and enter. Keys are 72 dp tall
 * and the pad sits at the bottom of the screen, under the thumb.
 */
@Composable
fun PinKeypad(
    enabled: Boolean,
    onDigit: (Char) -> Unit,
    onBackspace: () -> Unit,
    onSubmit: () -> Unit,
    deleteLabel: String,
    enterLabel: String,
    modifier: Modifier = Modifier,
) {
    Column(modifier.widthIn(max = 380.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        for (row in listOf("123", "456", "789")) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { d -> DigitKey(d, enabled, Modifier.weight(1f)) { onDigit(d) } }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            IconKey(gr.barlab.negroni.R.drawable.ic_pin_backspace, deleteLabel, enabled, BarLabColors.Muted, Modifier.weight(1f), onBackspace)
            DigitKey('0', enabled, Modifier.weight(1f)) { onDigit('0') }
            IconKey(gr.barlab.negroni.R.drawable.ic_pin_enter, enterLabel, enabled, BarLabColors.Gold, Modifier.weight(1f), onSubmit)
        }
    }
}

@Composable
private fun DigitKey(digit: Char, enabled: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Box(
        modifier.height(72.dp).border(1.dp, BarLabColors.LineStrong).clickable(enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(digit.toString(), style = MaterialTheme.typography.headlineMedium, color = if (enabled) BarLabColors.Text else BarLabColors.Faint)
    }
}

@Composable
private fun IconKey(@DrawableRes icon: Int, label: String, enabled: Boolean, tint: androidx.compose.ui.graphics.Color, modifier: Modifier, onClick: () -> Unit) {
    Box(
        modifier.height(72.dp).border(1.dp, BarLabColors.LineStrong)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(painterResource(icon), contentDescription = null, tint = if (enabled) tint else BarLabColors.Faint, modifier = Modifier.size(30.dp))
    }
}

/** "4:05" for a lock that ends in 4 minutes 5 seconds (rounded up, so it never shows 0:00 early). */
fun countdown(remainingMs: Long): String {
    val seconds = (max(0L, remainingMs) + 999) / 1000
    return "%d:%02d".format(seconds / 60, seconds % 60)
}
