package gr.barlab.negroni.ui.table

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDecoration
import gr.barlab.negroni.R
import gr.barlab.negroni.domain.Money
import gr.barlab.negroni.domain.Payment
import gr.barlab.negroni.domain.PaymentMethod
import gr.barlab.negroni.domain.Payments
import gr.barlab.negroni.domain.TableState
import gr.barlab.negroni.ui.components.Badge
import gr.barlab.negroni.ui.theme.BarLabColors
import gr.barlab.negroni.ui.theme.Spacing

/** Totals and payments of the current session, with reverse buttons. */
@Composable
fun PaymentsSection(state: TableState, payments: List<Payment>, onReverse: (Payment, String) -> Unit) {
    var reversing by remember { mutableStateOf<Payment?>(null) }
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s)) {
        Text(stringResource(R.string.pay_title).uppercase(), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
        Text(
            stringResource(R.string.pay_totals, Money.format(state.totalCents), Money.format(state.paidCents), Money.format(state.dueCents)),
            style = MaterialTheme.typography.titleMedium,
        )
        if (payments.isEmpty()) Text(stringResource(R.string.pay_none), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        payments.forEach { p ->
            val reversed = Payments.isReversed(p, payments)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s)) {
                val label = if (p.reversalOf != null) stringResource(R.string.pay_reversal, p.reason.orEmpty())
                else stringResource(if (p.method == PaymentMethod.Card) R.string.pay_card else R.string.pay_cash)
                Text(
                    stringResource(R.string.pay_line, clock(p.createdAtMs), label, p.createdByName),
                    style = MaterialTheme.typography.bodyMedium,
                    textDecoration = if (reversed) TextDecoration.LineThrough else null,
                    color = if (reversed) BarLabColors.Faint else MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f),
                )
                if (p.pendingSync) Badge(stringResource(R.string.round_pending_sync), BarLabColors.Rust)
                Text(Money.format(p.amountCents), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                if (reversed) Badge(stringResource(R.string.pay_reversed), BarLabColors.Faint)
                else if (p.reversalOf == null) TextButton(onClick = { reversing = p }) { Text(stringResource(R.string.pay_reverse), color = BarLabColors.Error) }
            }
        }
        val overpaid = state.paidCents - state.totalCents
        if (overpaid > 0) Text(stringResource(R.string.pay_overpaid, Money.format(overpaid)), color = BarLabColors.Error, style = MaterialTheme.typography.bodyMedium)
    }
    reversing?.let { p ->
        var reason by remember(p.id) { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { reversing = null },
            title = { Text(stringResource(R.string.pay_reverse_title)) },
            text = {
                OutlinedTextField(value = reason, onValueChange = { reason = it.take(200) }, label = { Text(stringResource(R.string.pay_reverse_reason)) }, singleLine = true)
            },
            confirmButton = {
                TextButton(enabled = reason.isNotBlank(), onClick = { onReverse(p, reason); reversing = null }) {
                    Text(stringResource(R.string.pay_reverse), color = BarLabColors.Error)
                }
            },
            dismissButton = { TextButton(onClick = { reversing = null }) { Text(stringResource(R.string.round_keep)) } },
        )
    }
}

/** Amount prefilled with what is due; overpayment is refused here (the rules cannot sum payments). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecordPaymentSheet(dueCents: Long, onRecord: (Long, PaymentMethod) -> Unit, onDismiss: () -> Unit) {
    var text by remember { mutableStateOf(Money.format(dueCents).removeSuffix(" €")) }
    var method by remember { mutableStateOf(PaymentMethod.Cash) }
    var error by remember { mutableStateOf<String?>(null) }
    val invalid = stringResource(R.string.pay_invalid)
    val notPositive = stringResource(R.string.pay_not_positive)
    val tooMuch = stringResource(R.string.pay_more_than_due, Money.format(dueCents))
    val cents = Payments.parseAmount(text)

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().imePadding().padding(horizontal = Spacing.l), verticalArrangement = Arrangement.spacedBy(Spacing.m)) {
            Text(stringResource(R.string.pay_record), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
            OutlinedTextField(
                value = text,
                onValueChange = { text = it; error = null },
                label = { Text(stringResource(R.string.pay_amount)) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                isError = error != null,
                supportingText = error?.let { { Text(it) } },
                modifier = Modifier.fillMaxWidth(),
            )
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                PaymentMethod.entries.forEachIndexed { i, m ->
                    SegmentedButton(
                        selected = method == m,
                        onClick = { method = m },
                        shape = SegmentedButtonDefaults.itemShape(i, PaymentMethod.entries.size),
                    ) { Text(stringResource(if (m == PaymentMethod.Card) R.string.pay_card else R.string.pay_cash)) }
                }
            }
            Button(
                onClick = {
                    when {
                        cents == null -> error = invalid
                        Payments.checkAmount(cents, dueCents) == Payments.AmountProblem.NotPositive -> error = notPositive
                        Payments.checkAmount(cents, dueCents) == Payments.AmountProblem.MoreThanDue -> error = tooMuch
                        else -> onRecord(cents, method)
                    }
                },
                modifier = Modifier.fillMaxWidth().padding(bottom = Spacing.l),
            ) {
                Text(stringResource(R.string.pay_record_amount, Money.format(cents ?: 0)).uppercase(), style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}
