package gr.barlab.negroni.ui.table

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextDecoration
import gr.barlab.negroni.R
import gr.barlab.negroni.domain.OrderLine
import gr.barlab.negroni.domain.Round
import gr.barlab.negroni.ui.components.QtyStepper
import gr.barlab.negroni.ui.theme.BarLabColors
import gr.barlab.negroni.ui.theme.Spacing

/**
 * Edit a Preparing round: quantities, notes, cancel single items. Cancelling every item cancels
 * the round. Items cannot be added here; that is a new round.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditRoundSheet(round: Round, onSave: (List<OrderLine>, String) -> Unit, onCancelRound: () -> Unit, onDismiss: () -> Unit) {
    val lines = remember(round.id) { mutableStateListOf(*round.lines.toTypedArray()) }
    var note by remember(round.id) { mutableStateOf(round.note) }
    val allCancelled = lines.all { it.cancelled }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(
            Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = Spacing.l, vertical = Spacing.s),
            verticalArrangement = Arrangement.spacedBy(Spacing.m),
        ) {
            Text(stringResource(R.string.edit_title), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
            Text(stringResource(R.string.edit_explainer), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary)
            lines.forEachIndexed { i, line ->
                val savedCancelled = round.lines.firstOrNull { it.lineId == line.lineId }?.cancelled == true
                HorizontalDivider(color = BarLabColors.LineFaint)
                Text(
                    line.name,
                    style = MaterialTheme.typography.titleMedium,
                    textDecoration = if (line.cancelled) TextDecoration.LineThrough else null,
                    color = if (line.cancelled) BarLabColors.Faint else MaterialTheme.colorScheme.onSurface,
                )
                if (!savedCancelled) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        QtyStepper(line.qty, { lines[i] = line.copy(qty = it) }, min = 1, enabled = !line.cancelled)
                        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.End) {
                            TextButton(onClick = { lines[i] = line.copy(cancelled = !line.cancelled) }) {
                                Text(
                                    stringResource(if (line.cancelled) R.string.edit_restore_item else R.string.edit_cancel_item),
                                    color = if (line.cancelled) MaterialTheme.colorScheme.primary else BarLabColors.Error,
                                )
                            }
                        }
                    }
                    if (!line.cancelled) {
                        OutlinedTextField(
                            value = line.note,
                            onValueChange = { lines[i] = line.copy(note = it.take(120)) },
                            label = { Text(stringResource(R.string.order_item_note)) },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
            OutlinedTextField(
                value = note,
                onValueChange = { note = it.take(300) },
                label = { Text(stringResource(R.string.order_order_note)) },
                modifier = Modifier.fillMaxWidth(),
            )
            if (allCancelled) Text(stringResource(R.string.edit_all_cancelled), color = BarLabColors.Error, style = MaterialTheme.typography.bodyMedium)
            Button(
                onClick = { if (allCancelled) onCancelRound() else onSave(lines.map { it.copy(note = it.note.trim()) }, note) },
                modifier = Modifier.fillMaxWidth().padding(bottom = Spacing.l),
            ) {
                Text(stringResource(if (allCancelled) R.string.round_cancel else R.string.edit_save).uppercase(), style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}
