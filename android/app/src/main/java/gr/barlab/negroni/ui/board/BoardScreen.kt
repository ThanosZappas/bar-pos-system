package gr.barlab.negroni.ui.board

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import gr.barlab.negroni.R
import gr.barlab.negroni.auth.StaffUser
import gr.barlab.negroni.domain.Round
import gr.barlab.negroni.domain.RoundStatus
import gr.barlab.negroni.domain.elapsed
import gr.barlab.negroni.orders.OrdersRepository
import gr.barlab.negroni.ui.components.Badge
import gr.barlab.negroni.ui.theme.BarLabColors
import gr.barlab.negroni.ui.theme.Spacing
import kotlinx.coroutines.delay

/** Live order board for barman and admin: oldest first, new and changed rounds highlighted. */
@Composable
fun BoardScreen(user: StaffUser, orders: OrdersRepository, currentSessionByTable: Map<String, String>) {
    val rounds by remember { orders.boardRounds() }.collectAsStateWithLifecycle(initialValue = emptyList())
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(10_000)
            now = System.currentTimeMillis()
        }
    }

    if (rounds.isEmpty()) {
        Text(stringResource(R.string.board_empty), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(Spacing.xxl))
        return
    }
    LazyColumn(contentPadding = PaddingValues(Spacing.l), verticalArrangement = Arrangement.spacedBy(Spacing.m), modifier = Modifier.fillMaxSize()) {
        items(rounds, key = { it.id }) { round ->
            BoardCard(round, now, late = round.isLate(currentSessionByTable), onOpen = { orders.open(round, user) }, onServe = { orders.serve(round, user) })
        }
    }
}

@Composable
private fun BoardCard(round: Round, now: Long, late: Boolean, onOpen: () -> Unit, onServe: () -> Unit) {
    val cancelled = round.status == RoundStatus.Cancelled
    val accent = when {
        round.isChanged -> BarLabColors.Error
        round.isNew -> BarLabColors.Gold
        else -> BarLabColors.LineStrong
    }
    OutlinedCard(
        border = BorderStroke(if (round.isNew || round.isChanged) 2.dp else 1.dp, accent),
        colors = CardDefaults.outlinedCardColors(containerColor = if (round.isNew || round.isChanged) accent.copy(alpha = 0.08f) else MaterialTheme.colorScheme.surface),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(Spacing.l), verticalArrangement = Arrangement.spacedBy(Spacing.s)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s)) {
                Text(round.tableName, style = MaterialTheme.typography.displayMedium.copy(fontFamily = MaterialTheme.typography.titleLarge.fontFamily), color = MaterialTheme.colorScheme.onSurface)
                if (round.isNew) Badge(stringResource(R.string.board_new), BarLabColors.Gold)
                if (round.isChanged && !cancelled) Badge(stringResource(R.string.board_edited), BarLabColors.Error)
                if (cancelled) Badge(stringResource(R.string.round_status_cancelled), BarLabColors.Error)
                if (late) Badge(stringResource(R.string.late_flag), BarLabColors.Rust)
                Text(
                    stringResource(R.string.board_waiting, elapsed(round.createdAtMs, now)),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.secondary,
                    modifier = Modifier.weight(1f),
                    textAlign = androidx.compose.ui.text.style.TextAlign.End,
                )
            }
            Text(stringResource(R.string.board_by, round.createdByName), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (late) Text(stringResource(R.string.late_explainer, round.tableName), style = MaterialTheme.typography.bodyMedium, color = BarLabColors.Rust)
            round.lines.forEach { line ->
                val struck = line.cancelled || cancelled
                Column {
                    Text(
                        stringResource(R.string.round_line, line.qty, line.name),
                        style = MaterialTheme.typography.titleLarge.copy(fontSize = 22.sp),
                        color = if (struck) BarLabColors.Faint else MaterialTheme.colorScheme.onSurface,
                        textDecoration = if (struck) TextDecoration.LineThrough else null,
                    )
                    if (line.note.isNotEmpty()) Text(stringResource(R.string.round_note, line.note), style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.secondary)
                }
            }
            if (round.note.isNotEmpty()) Text(stringResource(R.string.round_order_note, round.note), style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.secondary)
            if (round.isChanged) {
                val who = if (cancelled) stringResource(R.string.board_cancelled_by, round.cancelledByName.orEmpty())
                else stringResource(R.string.round_edited_by, round.lastEditByName.orEmpty())
                Text(who, style = MaterialTheme.typography.bodyMedium, color = BarLabColors.Error)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.s, Alignment.End)) {
                if (round.isNew || round.isChanged) OutlinedButton(onClick = onOpen) { Text(stringResource(R.string.board_got_it).uppercase(), style = MaterialTheme.typography.labelLarge) }
                if (round.status == RoundStatus.Preparing) Button(onClick = onServe) { Text(stringResource(R.string.round_mark_served).uppercase(), style = MaterialTheme.typography.labelLarge) }
            }
        }
    }
}
