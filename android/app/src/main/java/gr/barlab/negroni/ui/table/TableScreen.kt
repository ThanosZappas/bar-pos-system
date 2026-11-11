package gr.barlab.negroni.ui.table

import gr.barlab.negroni.ui.components.caps
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedButton
import gr.barlab.negroni.catalog.DiningTable
import gr.barlab.negroni.catalog.ReceiptHeader
import gr.barlab.negroni.domain.Money
import gr.barlab.negroni.domain.Payments
import gr.barlab.negroni.domain.Round
import gr.barlab.negroni.domain.TableState
import gr.barlab.negroni.domain.TableStatus
import gr.barlab.negroni.orders.OrdersRepository
import gr.barlab.negroni.ui.components.TableStatusBadge
import gr.barlab.negroni.ui.theme.Spacing

/** A table's current session: rounds, payments, summary, closing, and the button for a new order. */
@Composable
fun TableScreen(
    table: DiningTable,
    user: StaffUser,
    orders: OrdersRepository,
    header: ReceiptHeader,
    onBack: () -> Unit,
    onNewOrder: () -> Unit,
    onServe: (Round) -> Unit,
    freeTables: List<DiningTable>,
    onMove: (DiningTable) -> Unit,
) {
    val rounds by remember(table.currentSessionId) { orders.roundsForSessions(listOf(table.currentSessionId)) }
        .collectAsStateWithLifecycle(initialValue = emptyList())
    val payments by remember(table.currentSessionId) { orders.paymentsForSessions(listOf(table.currentSessionId)) }
        .collectAsStateWithLifecycle(initialValue = emptyList())
    val state = TableState.derive(rounds, Payments.paidCents(payments))
    var editing by remember { mutableStateOf<Round?>(null) }
    var paying by remember { mutableStateOf(false) }
    var showSummary by remember { mutableStateOf(false) }
    var confirmClose by remember { mutableStateOf(false) }
    var moving by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(end = Spacing.l), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹ " + stringResource(R.string.back)) }
            Text(
                stringResource(R.string.table_title, table.name) + " · " + Money.format(state.totalCents),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.weight(1f),
            )
            TableStatusBadge(state.status)
        }
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
                    onServe = { onServe(round) },
                    onEdit = { editing = round },
                    onCancel = { orders.cancel(round, user) },
                    canCancel = user.may { it.cancelOrders },
                )
            }
            if (state.totalCents > 0 || payments.isNotEmpty()) {
                item(key = "payments") {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s)) {
                        PaymentsSection(state, payments, onReverse = { p, reason -> orders.reverse(p, reason, user) }, canReverse = user.may { it.reversePayments })
                        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s)) {
                            if (state.dueCents > 0 && user.may { it.payments }) OutlinedButton(onClick = { paying = true }) { Text(stringResource(R.string.pay_record).caps(), style = MaterialTheme.typography.labelLarge) }
                            TextButton(onClick = { showSummary = true }) { Text(stringResource(R.string.summary_button)) }
                            if (user.may { it.moveTables }) TextButton(onClick = { moving = true }) { Text(stringResource(R.string.move_table)) }
                        }
                        if (state.status == TableStatus.Paid && user.may { it.closeTables }) {
                            Button(onClick = { confirmClose = true }, modifier = Modifier.fillMaxWidth()) {
                                Text(stringResource(R.string.close_table).caps(), style = MaterialTheme.typography.labelLarge)
                            }
                        } else if (state.totalCents > 0) {
                            Text(stringResource(R.string.close_only_paid), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
        Button(onClick = onNewOrder, modifier = Modifier.fillMaxWidth().padding(Spacing.l)) {
            Text(stringResource(R.string.order_new).caps(), style = MaterialTheme.typography.labelLarge)
        }
    }

    if (paying) {
        RecordPaymentSheet(state.dueCents, onRecord = { cents, method -> orders.addPayment(table, cents, method, user); paying = false }, onDismiss = { paying = false })
    }
    if (moving) {
        AlertDialog(
            onDismissRequest = { moving = false },
            title = { Text(stringResource(R.string.move_title, table.name)) },
            text = {
                if (freeTables.isEmpty()) Text(stringResource(R.string.move_none))
                else FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.s)) {
                    freeTables.forEach { t -> OutlinedButton(onClick = { moving = false; onMove(t) }) { Text(t.name) } }
                }
            },
            confirmButton = { TextButton(onClick = { moving = false }) { Text(stringResource(R.string.close)) } },
        )
    }
    if (showSummary) SummaryDialog(header, table.name, rounds, payments, onDismiss = { showSummary = false })
    if (confirmClose) {
        AlertDialog(
            onDismissRequest = { confirmClose = false },
            title = { Text(stringResource(R.string.close_confirm_title, table.name)) },
            text = { Text(stringResource(R.string.close_confirm_body)) },
            confirmButton = {
                TextButton(onClick = { confirmClose = false; orders.close(table, rounds, payments, user); onBack() }) { Text(stringResource(R.string.close_table)) }
            },
            dismissButton = { TextButton(onClick = { confirmClose = false }) { Text(stringResource(R.string.round_keep)) } },
        )
    }

    // Edit the live version: if the round changed meanwhile, the sheet shows the current data;
    // once it is no longer editable (served or cancelled elsewhere) the sheet closes.
    val live = editing?.let { e -> rounds.firstOrNull { it.id == e.id } }
    val stillEditable = live?.isEditable == true
    LaunchedEffect(editing, stillEditable) {
        if (editing != null && !stillEditable) editing = null
    }
    if (live != null && stillEditable) {
        EditRoundSheet(
            round = live,
            onSave = { lines, note -> orders.edit(live, lines, note, user); editing = null },
            onCancelRound = { orders.cancel(live, user); editing = null },
            canCancel = user.may { it.cancelOrders },
            onDismiss = { editing = null },
        )
    }
}
