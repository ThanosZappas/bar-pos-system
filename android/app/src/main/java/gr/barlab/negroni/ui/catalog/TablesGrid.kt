package gr.barlab.negroni.ui.catalog

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
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
import gr.barlab.negroni.ui.theme.BarLabColors
import gr.barlab.negroni.ui.theme.Spacing

/** Table grid. Every table shows Free until orders exist (milestone 4 adds status colours and tapping). */
@Composable
fun TablesGrid(tables: List<DiningTable>, modifier: Modifier = Modifier, onTableClick: ((DiningTable) -> Unit)? = null) {
    if (tables.isEmpty()) {
        Text(stringResource(R.string.tables_empty), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = modifier.padding(Spacing.xxl))
        return
    }
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 84.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(Spacing.l),
        horizontalArrangement = Arrangement.spacedBy(Spacing.s),
        verticalArrangement = Arrangement.spacedBy(Spacing.s),
        modifier = modifier.fillMaxSize(),
    ) {
        items(tables, key = { it.id }) { table ->
            OutlinedCard(
                onClick = { onTableClick?.invoke(table) },
                enabled = onTableClick != null,
                border = BorderStroke(1.dp, BarLabColors.LineStrong),
                modifier = Modifier.aspectRatio(1f),
            ) {
                Column(Modifier.fillMaxSize().padding(Spacing.s), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(table.name, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurface, maxLines = 1)
                    Text(stringResource(R.string.table_status_free).uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}
