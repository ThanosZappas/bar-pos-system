package gr.barlab.negroni.ui.admin

import androidx.compose.foundation.layout.width
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import gr.barlab.negroni.R
import gr.barlab.negroni.domain.Money
import gr.barlab.negroni.domain.Payment
import gr.barlab.negroni.domain.PaymentMethod
import gr.barlab.negroni.domain.businessDayStart
import gr.barlab.negroni.domain.summaryLines
import gr.barlab.negroni.orders.ClosedBill
import gr.barlab.negroni.orders.OrdersRepository
import gr.barlab.negroni.ui.components.caps
import gr.barlab.negroni.ui.table.clock
import gr.barlab.negroni.ui.theme.BarLabColors
import gr.barlab.negroni.ui.theme.Spacing

/**
 * Admin only: tonight's payments with cash and card totals (for counting the drawer) and the
 * tables closed tonight. "Tonight" starts at 06:00, like the dashboard's analytics.
 */
@Composable
fun PaymentsTab(orders: OrdersRepository, nowMs: Long) {
    val since = businessDayStart(nowMs)
    val payments by remember(since) { orders.paymentsSince(since) }.collectAsStateWithLifecycle(initialValue = emptyList())
    val bills by remember(since) { orders.closedBillsSince(since) }.collectAsStateWithLifecycle(initialValue = emptyList())
    var open by remember { mutableStateOf<String?>(null) }
    fun sum(method: PaymentMethod? = null) = payments.filter { method == null || it.method == method }.sumOf { it.amountCents }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(Spacing.l), verticalArrangement = Arrangement.spacedBy(Spacing.s)) {
        item {
            SectionHeading(stringResource(R.string.admin_payments_tonight))
            Text(
                stringResource(R.string.admin_payments_totals, Money.format(sum(PaymentMethod.Cash)), Money.format(sum(PaymentMethod.Card)), Money.format(sum())),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(vertical = Spacing.s),
            )
            if (payments.isEmpty()) Text(stringResource(R.string.pay_none), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        items(payments, key = { "p-${it.id}" }) { PaymentRow(it, withTable = true) }
        item {
            HorizontalDivider(color = BarLabColors.Line, modifier = Modifier.padding(vertical = Spacing.m))
            SectionHeading(stringResource(R.string.admin_closed_tonight))
            if (bills.isEmpty()) Text(stringResource(R.string.admin_closed_none), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = Spacing.s))
        }
        items(bills, key = { "b-${it.sessionId}" }) { bill ->
            ClosedBillRow(bill, expanded = open == bill.sessionId, orders = orders, onToggle = { open = if (open == bill.sessionId) null else bill.sessionId })
        }
    }
}

@Composable
private fun PaymentRow(p: Payment, withTable: Boolean) {
    val label = if (p.reversalOf != null) stringResource(R.string.pay_reversal, p.reason.orEmpty())
    else stringResource(if (p.method == PaymentMethod.Card) R.string.pay_card else R.string.pay_cash)
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            listOfNotNull(clock(p.createdAtMs), if (withTable) stringResource(R.string.table_title, p.tableName) else null, label, p.createdByName).joinToString(" · "),
            style = MaterialTheme.typography.bodyMedium,
            color = if (p.reversalOf != null) BarLabColors.Rust else MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        Text(Money.format(p.amountCents), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
    }
}

/** One closed bill; opening it loads its lines and payments. */
@Composable
private fun ClosedBillRow(bill: ClosedBill, expanded: Boolean, orders: OrdersRepository, onToggle: () -> Unit) {
    Column(Modifier.fillMaxWidth().clickable(onClick = onToggle).padding(vertical = Spacing.xs)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                pluralStringResource(R.plurals.admin_closed_row, bill.roundCount, clock(bill.closedAtMs), bill.tableName, bill.roundCount, bill.closedByName),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f),
            )
            Text(Money.format(bill.totalCents), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
        }
        if (expanded) {
            val rounds by remember(bill.sessionId) { orders.roundsForSessions(listOf(bill.sessionId)) }.collectAsStateWithLifecycle(initialValue = emptyList())
            val payments by remember(bill.sessionId) { orders.paymentsForSessions(listOf(bill.sessionId)) }.collectAsStateWithLifecycle(initialValue = emptyList())
            Column(Modifier.padding(start = Spacing.l, top = Spacing.xs), verticalArrangement = Arrangement.spacedBy(Spacing.xxs)) {
                summaryLines(rounds).forEach { l ->
                    Row {
                        Text(stringResource(R.string.round_line, l.qty, l.name), style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                        Text(Money.format(l.totalCents), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
                    }
                }
                payments.forEach { PaymentRow(it, withTable = false) }
            }
        }
        HorizontalDivider(color = BarLabColors.LineFaint, modifier = Modifier.padding(top = Spacing.xs))
    }
}

/** A clearly separated heading: larger serif, gold, with a gold rule under it. */
@Composable
private fun SectionHeading(text: String) {
    androidx.compose.foundation.layout.Column(Modifier.padding(top = Spacing.l, bottom = Spacing.xs)) {
        Text(text, style = MaterialTheme.typography.headlineSmall.copy(fontFamily = MaterialTheme.typography.titleLarge.fontFamily), color = MaterialTheme.colorScheme.primary)
        androidx.compose.material3.HorizontalDivider(
            thickness = 1.dp,
            color = gr.barlab.negroni.ui.theme.BarLabColors.Gold.copy(alpha = 0.6f),
            modifier = Modifier.padding(top = Spacing.xs).width(64.dp),
        )
    }
}
