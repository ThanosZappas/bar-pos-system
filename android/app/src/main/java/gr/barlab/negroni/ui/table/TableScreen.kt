package gr.barlab.negroni.ui.table

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
import androidx.compose.material3.MaterialTheme
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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import gr.barlab.negroni.R
import gr.barlab.negroni.auth.StaffUser
import gr.barlab.negroni.catalog.DiningTable
import gr.barlab.negroni.domain.Money
import gr.barlab.negroni.domain.Round
import gr.barlab.negroni.domain.TableState
import gr.barlab.negroni.orders.OrdersRepository
import gr.barlab.negroni.ui.components.TableStatusBadge
import gr.barlab.negroni.ui.theme.Spacing

/** A table's current session: its rounds, total, and the button for a new order. */
@Composable
fun TableScreen(table: DiningTable, user: StaffUser, orders: OrdersRepository, onBack: () -> Unit, onNewOrder: () -> Unit) {
    val rounds by remember(table.currentSessionId) { orders.roundsForSessions(listOf(table.currentSessionId)) }
        .collectAsStateWithLifecycle(initialValue = emptyList())
    val state = TableState.derive(rounds)
    var editing by remember { mutableStateOf<Round?>(null) }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(end = Spacing.l), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹ " + stringResource(R.string.back)) }
            Text(
                stringResource(R.string.table_title, table.name),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.weight(1f),
            )
            TableStatusBadge(state.status)
        }
        Text(
            stringResource(R.string.table_total, Money.format(state.totalCents)),
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(horizontal = Spacing.l, vertical = Spacing.xs),
        )
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(Spacing.l),
            verticalArrangement = Arrangement.spacedBy(Spacing.m),
        ) {
            if (rounds.isEmpty()) {
                item { Text(stringResource(R.string.table_no_rounds), color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            items(rounds, key = { it.id }) { round ->
                RoundCard(
                    round = round,
                    onServe = { orders.serve(round, user) },
                    onEdit = { editing = round },
                    onCancel = { orders.cancel(round, user) },
                )
            }
        }
        Button(onClick = onNewOrder, modifier = Modifier.fillMaxWidth().padding(Spacing.l)) {
            Text(stringResource(R.string.order_new).uppercase(), style = MaterialTheme.typography.labelLarge)
        }
    }

    // Edit the live version: if the round changed meanwhile, the sheet shows the current data.
    editing?.let { e ->
        val live = rounds.firstOrNull { it.id == e.id }
        if (live == null || !live.isEditable) {
            editing = null
        } else {
            EditRoundSheet(
                round = live,
                onSave = { lines, note -> orders.edit(live, lines, note, user); editing = null },
                onCancelRound = { orders.cancel(live, user); editing = null },
                onDismiss = { editing = null },
            )
        }
    }
}
