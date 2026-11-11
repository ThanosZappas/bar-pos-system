package gr.barlab.negroni.ui.table

import gr.barlab.negroni.ui.components.caps
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextDecoration
import gr.barlab.negroni.R
import gr.barlab.negroni.domain.Money
import gr.barlab.negroni.domain.OrderLine
import gr.barlab.negroni.domain.Round
import gr.barlab.negroni.domain.RoundStatus
import gr.barlab.negroni.ui.components.Badge
import gr.barlab.negroni.ui.components.RoundStatusBadge
import gr.barlab.negroni.ui.components.color
import gr.barlab.negroni.ui.theme.BarLabColors
import gr.barlab.negroni.ui.theme.Spacing
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val TIME = DateTimeFormatter.ofPattern("HH:mm")
fun clock(ms: Long): String = TIME.format(Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault()))

/** One round on a table: status, lines, notes, and the actions allowed while it is Preparing. */
@Composable
fun RoundCard(round: Round, onServe: () -> Unit, onEdit: () -> Unit, onCancel: () -> Unit, modifier: Modifier = Modifier) {
    var confirmCancel by remember { mutableStateOf(false) }
    OutlinedCard(border = BorderStroke(Spacing.hairline, round.status.color()), modifier = modifier.fillMaxWidth()) {
        Column(Modifier.padding(Spacing.l), verticalArrangement = Arrangement.spacedBy(Spacing.s)) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.s), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                RoundStatusBadge(round.status)
                if (round.pendingSync) Badge(stringResource(R.string.round_pending_sync), BarLabColors.Rust)
                Text(
                    stringResource(R.string.round_meta, clock(round.createdAtMs), round.createdByName),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.align(Alignment.CenterVertically),
                )
            }
            round.lines.forEach { LineRow(it, roundCancelled = round.status == RoundStatus.Cancelled) }
            if (round.note.isNotEmpty()) {
                Text(stringResource(R.string.round_order_note, round.note), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary)
            }
            if (round.editCount > 0 && round.lastEditByName != null) {
                Text(stringResource(R.string.round_edited_by, round.lastEditByName), style = MaterialTheme.typography.bodySmall, color = BarLabColors.Error)
            }
            if (round.status == RoundStatus.Served && round.servedAtMs != null) {
                Text(
                    stringResource(R.string.round_served_by, clock(round.servedAtMs), round.servedByName.orEmpty()),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (round.isEditable) {
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s), verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = onEdit) { Text(stringResource(R.string.round_edit)) }
                    TextButton(onClick = { confirmCancel = true }) { Text(stringResource(R.string.round_cancel), color = BarLabColors.Error) }
                    Row(Modifier.weight(1f), horizontalArrangement = Arrangement.End) {
                        Button(onClick = onServe) { Text(stringResource(R.string.round_mark_served).caps(), style = MaterialTheme.typography.labelLarge) }
                    }
                }
            }
        }
    }
    if (confirmCancel) {
        AlertDialog(
            onDismissRequest = { confirmCancel = false },
            title = { Text(stringResource(R.string.round_cancel_confirm_title)) },
            text = { Text(stringResource(R.string.round_cancel_confirm_body)) },
            confirmButton = { TextButton(onClick = { confirmCancel = false; onCancel() }) { Text(stringResource(R.string.round_cancel), color = BarLabColors.Error) } },
            dismissButton = { TextButton(onClick = { confirmCancel = false }) { Text(stringResource(R.string.round_keep)) } },
        )
    }
}

@Composable
private fun LineRow(line: OrderLine, roundCancelled: Boolean) {
    val struck = line.cancelled || roundCancelled
    val decoration = if (struck) TextDecoration.LineThrough else null
    Column {
        Row(verticalAlignment = Alignment.Top) {
            Text(
                stringResource(R.string.round_line, line.qty, line.name),
                style = MaterialTheme.typography.titleMedium,
                color = if (struck) BarLabColors.Faint else MaterialTheme.colorScheme.onSurface,
                textDecoration = decoration,
                modifier = Modifier.weight(1f),
            )
            Text(
                Money.format(line.priceCents * line.qty),
                style = MaterialTheme.typography.titleMedium,
                color = if (struck) BarLabColors.Faint else MaterialTheme.colorScheme.primary,
                textDecoration = decoration,
            )
        }
        if (line.note.isNotEmpty()) {
            Text(stringResource(R.string.round_note, line.note), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary)
        }
    }
}
