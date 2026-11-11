package gr.barlab.negroni.ui.catalog

import gr.barlab.negroni.ui.components.caps
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import gr.barlab.negroni.R
import gr.barlab.negroni.catalog.DiningTable
import gr.barlab.negroni.domain.Money
import gr.barlab.negroni.domain.TableState
import gr.barlab.negroni.domain.TableStatus
import gr.barlab.negroni.ui.components.color
import gr.barlab.negroni.ui.components.label
import gr.barlab.negroni.ui.theme.Spacing

/** Table grid with status colours; the border and label carry the status, the amount shows what is due. */
@Composable
fun TablesGrid(tables: List<DiningTable>, states: Map<String, TableState>, onTableClick: (DiningTable) -> Unit, modifier: Modifier = Modifier) {
    if (tables.isEmpty()) {
        Text(stringResource(R.string.tables_empty), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = modifier.padding(Spacing.xxl))
        return
    }
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 84.dp),
        contentPadding = PaddingValues(Spacing.l),
        horizontalArrangement = Arrangement.spacedBy(Spacing.s),
        verticalArrangement = Arrangement.spacedBy(Spacing.s),
        modifier = modifier.fillMaxSize(),
    ) {
        items(tables, key = { it.id }) { table ->
            val state = states[table.id]
            val status = state?.status ?: TableStatus.Free
            val color = status.color()
            OutlinedCard(
                onClick = { onTableClick(table) },
                border = BorderStroke(if (status == TableStatus.Free) 1.dp else 2.dp, color),
                colors = CardDefaults.outlinedCardColors(containerColor = if (status == TableStatus.Free) MaterialTheme.colorScheme.surface else color.copy(alpha = 0.10f)),
                modifier = Modifier.aspectRatio(1f),
            ) {
                Column(Modifier.fillMaxSize().padding(Spacing.xs), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(table.name, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurface, maxLines = 1)
                    Text(stringResource(status.label()).caps(), style = MaterialTheme.typography.labelSmall, color = if (status == TableStatus.Free) MaterialTheme.colorScheme.onSurfaceVariant else color, maxLines = 1)
                    if (state != null && state.totalCents > 0) {
                        Text(Money.format(state.dueCents), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}
