package gr.barlab.negroni.ui.catalog

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import gr.barlab.negroni.R
import gr.barlab.negroni.catalog.DiningTable
import gr.barlab.negroni.domain.Money
import gr.barlab.negroni.domain.TableState
import gr.barlab.negroni.domain.TableStatus
import gr.barlab.negroni.ui.components.caps
import gr.barlab.negroni.ui.components.color
import gr.barlab.negroni.ui.components.label
import gr.barlab.negroni.ui.theme.Spacing
import kotlin.math.ceil
import kotlin.math.min

/** How the tables share the screen: [columns] per row, square tiles of [side] (dp). */
data class TableLayout(val columns: Int, val side: Float)

/**
 * The column count that gives the biggest square tiles while all [count] tables fit in
 * [width]×[height] (dp) with [gap] between them, capped at [maxSide]. Tiles never go below
 * [minSide]; then the grid scrolls instead.
 */
fun fitTables(count: Int, width: Float, height: Float, gap: Float, maxSide: Float = 150f, minSide: Float = 60f): TableLayout {
    if (count <= 0) return TableLayout(1, maxSide)
    var best = TableLayout(1, 0f)
    for (columns in 1..count) {
        val rows = ceil(count / columns.toFloat()).toInt()
        val side = min((width - gap * (columns - 1)) / columns, (height - gap * (rows - 1)) / rows)
        if (side > best.side) best = TableLayout(columns, side)
    }
    if (best.side < minSide) {
        // Too many to fit: as many columns of minSide as the width allows, and scroll.
        val columns = ((width + gap) / (minSide + gap)).toInt().coerceAtLeast(1)
        return TableLayout(columns, (width - gap * (columns - 1)) / columns)
    }
    return best.copy(side = min(best.side, maxSide))
}

/**
 * All tables on one screen, sized for this phone: the border and label carry the status, the
 * amount shows what is due.
 */
@Composable
fun TablesGrid(tables: List<DiningTable>, states: Map<String, TableState>, onTableClick: (DiningTable) -> Unit, modifier: Modifier = Modifier) {
    if (tables.isEmpty()) {
        Box(modifier.fillMaxSize().padding(Spacing.xxl), contentAlignment = Alignment.Center) {
            Text(stringResource(R.string.tables_empty), style = MaterialTheme.typography.titleLarge.copy(fontSize = 24.sp), color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        }
        return
    }
    BoxWithConstraints(modifier.fillMaxSize().padding(Spacing.m)) {
        val gap = Spacing.s
        val layout = remember(tables.size, maxWidth, maxHeight) { fitTables(tables.size, maxWidth.value, maxHeight.value, gap.value) }
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(gap, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            tables.chunked(layout.columns).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                    row.forEach { table -> TableTile(table, states[table.id], layout.side.dp, onTableClick) }
                }
            }
        }
    }
}

@Composable
private fun TableTile(table: DiningTable, state: TableState?, side: Dp, onClick: (DiningTable) -> Unit) {
    val status = state?.status ?: TableStatus.Free
    val color = status.color()
    val k = side.value / 100f // text grows and shrinks with the tile
    OutlinedCard(
        onClick = { onClick(table) },
        border = BorderStroke(if (status == TableStatus.Free) 1.dp else 2.dp, color),
        colors = CardDefaults.outlinedCardColors(containerColor = if (status == TableStatus.Free) MaterialTheme.colorScheme.surface else color.copy(alpha = 0.10f)),
        modifier = Modifier.size(side),
    ) {
        Column(Modifier.fillMaxSize().padding(Spacing.xs), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Text(table.name, style = MaterialTheme.typography.titleLarge.copy(fontSize = (26 * k).coerceIn(16f, 34f).sp), color = MaterialTheme.colorScheme.onSurface, maxLines = 1)
            Text(
                stringResource(status.label()).caps(),
                style = MaterialTheme.typography.labelSmall.copy(fontSize = (11 * k).coerceIn(8f, 13f).sp),
                color = if (status == TableStatus.Free) MaterialTheme.colorScheme.onSurfaceVariant else color,
                maxLines = 1,
            )
            if (state != null && state.totalCents > 0) {
                Text(Money.format(state.dueCents), style = MaterialTheme.typography.bodySmall.copy(fontSize = (12 * k).coerceIn(9f, 14f).sp), color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            }
        }
    }
}
