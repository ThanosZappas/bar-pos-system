package gr.barlab.negroni.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import gr.barlab.negroni.R
import gr.barlab.negroni.domain.RoundStatus
import gr.barlab.negroni.domain.TableStatus
import gr.barlab.negroni.ui.theme.BarLabColors
import gr.barlab.negroni.ui.theme.Spacing

/** Status colours from design/tokens.md. */
fun TableStatus.color(): Color = when (this) {
    TableStatus.Free -> BarLabColors.LineStrong
    TableStatus.Preparing -> BarLabColors.Gold
    TableStatus.Served -> BarLabColors.Slate
    TableStatus.PartiallyPaid -> BarLabColors.Rust
    TableStatus.Paid -> BarLabColors.Green
}

fun TableStatus.label(): Int = when (this) {
    TableStatus.Free -> R.string.table_status_free
    TableStatus.Preparing -> R.string.table_status_preparing
    TableStatus.Served -> R.string.table_status_served
    TableStatus.PartiallyPaid -> R.string.table_status_partially_paid
    TableStatus.Paid -> R.string.table_status_paid
}

fun RoundStatus.color(): Color = when (this) {
    RoundStatus.Preparing -> BarLabColors.Gold
    RoundStatus.Served -> BarLabColors.Slate
    RoundStatus.Cancelled -> BarLabColors.Faint
}

fun RoundStatus.label(): Int = when (this) {
    RoundStatus.Preparing -> R.string.round_status_preparing
    RoundStatus.Served -> R.string.round_status_served
    RoundStatus.Cancelled -> R.string.round_status_cancelled
}

/** The site's ".badge": small spaced uppercase text in a hairline box of the same colour. */
@Composable
fun Badge(text: String, color: Color, modifier: Modifier = Modifier) {
    Text(
        text.caps(),
        style = MaterialTheme.typography.labelSmall,
        color = color,
        modifier = modifier
            .border(BorderStroke(Spacing.hairline, color))
            .padding(horizontal = Spacing.s, vertical = Spacing.xxs),
    )
}

@Composable
fun TableStatusBadge(status: TableStatus) = Badge(stringResource(status.label()), status.color())

@Composable
fun RoundStatusBadge(status: RoundStatus) = Badge(stringResource(status.label()), status.color())
