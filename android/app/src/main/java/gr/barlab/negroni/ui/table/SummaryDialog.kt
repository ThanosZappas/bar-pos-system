package gr.barlab.negroni.ui.table

import gr.barlab.negroni.ui.components.caps
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import gr.barlab.negroni.R
import gr.barlab.negroni.catalog.ReceiptHeader
import gr.barlab.negroni.domain.Money
import gr.barlab.negroni.domain.Payment
import gr.barlab.negroni.domain.PaymentMethod
import gr.barlab.negroni.domain.Payments
import gr.barlab.negroni.domain.Round
import gr.barlab.negroni.domain.TableState
import gr.barlab.negroni.domain.summaryLines
import gr.barlab.negroni.ui.theme.Spacing
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val DATE_TIME = DateTimeFormatter.ofPattern("dd/MM/yyyy, HH:mm")

/** Black on white like paper, "Not a fiscal receipt" at top and bottom, to show the guest. */
@Composable
fun SummaryDialog(header: ReceiptHeader, tableName: String, rounds: List<Round>, payments: List<Payment>, onDismiss: () -> Unit) {
    val ink = Color(0xFF111111)
    val state = TableState.derive(rounds, Payments.paidCents(payments))
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Color.White,
        confirmButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.close), color = ink) } },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                NotFiscal(ink)
                Text(header.barName, style = MaterialTheme.typography.titleLarge, color = ink, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                listOf(header.address, header.phone).filter { it.isNotEmpty() }.forEach {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = ink, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                }
                Text(
                    stringResource(R.string.summary_table, tableName, DATE_TIME.format(Instant.now().atZone(ZoneId.systemDefault()))),
                    style = MaterialTheme.typography.bodySmall, color = ink, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
                )
                HorizontalDivider(color = ink)
                summaryLines(rounds).forEach { l -> AmountRow("${l.qty}× ${l.name}", l.totalCents, ink) }
                HorizontalDivider(color = ink)
                AmountRow(stringResource(R.string.summary_total), state.totalCents, ink, bold = true)
                payments.forEach { p ->
                    val label = if (p.reversalOf != null) stringResource(R.string.pay_reversal, p.reason.orEmpty())
                    else stringResource(if (p.method == PaymentMethod.Card) R.string.pay_card else R.string.pay_cash)
                    AmountRow(label, p.amountCents, ink)
                }
                AmountRow(stringResource(R.string.summary_due), state.dueCents, ink, bold = true)
                if (header.footer.isNotEmpty()) Text(header.footer, style = MaterialTheme.typography.bodySmall, color = ink, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                NotFiscal(ink)
            }
        },
    )
}

@Composable
private fun NotFiscal(ink: Color) {
    Text(
        stringResource(R.string.summary_not_fiscal).caps(),
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.Bold,
        color = ink,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().border(BorderStroke(2.dp, ink)).background(Color.White).padding(Spacing.s),
    )
}

@Composable
private fun AmountRow(label: String, cents: Long, ink: Color, bold: Boolean = false) {
    val weight = if (bold) FontWeight.Bold else FontWeight.Normal
    Row(Modifier.fillMaxWidth()) {
        Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = weight, color = ink, modifier = Modifier.weight(1f))
        Text(Money.format(cents), style = MaterialTheme.typography.bodyMedium, fontWeight = weight, color = ink)
    }
}
