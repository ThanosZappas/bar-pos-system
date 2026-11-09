package gr.barlab.negroni.ui.order

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import gr.barlab.negroni.R
import gr.barlab.negroni.catalog.DiningTable
import gr.barlab.negroni.catalog.Menu
import gr.barlab.negroni.domain.Money
import gr.barlab.negroni.domain.OrderDraft
import gr.barlab.negroni.ui.catalog.MenuList
import gr.barlab.negroni.ui.components.QtyStepper
import gr.barlab.negroni.ui.theme.BarLabColors
import gr.barlab.negroni.ui.theme.Spacing

/** Holds the cart while the server builds a round; survives rotation. */
class NewOrderViewModel : ViewModel() {
    var draft by mutableStateOf(OrderDraft())
}

/** Browse the menu, add items with quantity and note, review, then send the round to the bar. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewOrderScreen(table: DiningTable, menu: Menu, onSubmit: (OrderDraft) -> Unit, onBack: () -> Unit) {
    val vm = viewModel(key = "order-${table.id}") { NewOrderViewModel() }
    var picked by remember { mutableStateOf<Menu.Item?>(null) }
    var reviewing by remember { mutableStateOf(false) }
    var confirmDiscard by remember { mutableStateOf(false) }
    val draft = vm.draft

    BackHandler(enabled = !draft.isEmpty) { confirmDiscard = true }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = { if (draft.isEmpty) onBack() else confirmDiscard = true }) { Text("‹ " + stringResource(R.string.back)) }
            Text(stringResource(R.string.order_title, table.name), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
        }
        MenuList(menu, modifier = Modifier.weight(1f), onItemClick = { picked = it })
        if (draft.isEmpty) {
            Text(stringResource(R.string.order_empty), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(Spacing.l))
        } else {
            Button(onClick = { reviewing = true }, modifier = Modifier.fillMaxWidth().padding(Spacing.l)) {
                Text(pluralStringResource(R.plurals.order_review, draft.itemCount, draft.itemCount, Money.format(draft.totalCents)).uppercase(), style = MaterialTheme.typography.labelLarge)
            }
        }
    }

    picked?.let { item ->
        AddItemSheet(item, onAdd = { qty, note -> vm.draft = vm.draft.add(item.id, item.name, item.priceCents, qty, note); picked = null }, onDismiss = { picked = null })
    }
    if (reviewing) {
        ReviewSheet(
            draft = draft,
            onChange = { vm.draft = it },
            onSubmit = { reviewing = false; onSubmit(vm.draft); vm.draft = OrderDraft() },
            onDismiss = { reviewing = false },
        )
    }
    if (confirmDiscard) {
        AlertDialog(
            onDismissRequest = { confirmDiscard = false },
            title = { Text(stringResource(R.string.order_discard_title)) },
            text = { Text(stringResource(R.string.order_discard_body)) },
            confirmButton = { TextButton(onClick = { confirmDiscard = false; vm.draft = OrderDraft(); onBack() }) { Text(stringResource(R.string.order_discard), color = BarLabColors.Error) } },
            dismissButton = { TextButton(onClick = { confirmDiscard = false }) { Text(stringResource(R.string.order_continue)) } },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddItemSheet(item: Menu.Item, onAdd: (Int, String) -> Unit, onDismiss: () -> Unit) {
    var qty by remember { mutableIntStateOf(1) }
    var note by remember { mutableStateOf("") }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().imePadding().padding(horizontal = Spacing.l), verticalArrangement = Arrangement.spacedBy(Spacing.m)) {
            Row(verticalAlignment = Alignment.Top) {
                Text(item.name, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                Text(Money.format(item.priceCents), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
            }
            if (item.description.isNotEmpty()) Text(item.description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary)
            QtyStepper(qty, { qty = it }, min = 1)
            OutlinedTextField(
                value = note,
                onValueChange = { note = it.take(120) },
                label = { Text(stringResource(R.string.order_item_note)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Button(onClick = { onAdd(qty, note) }, modifier = Modifier.fillMaxWidth().padding(bottom = Spacing.l)) {
                Text("${stringResource(R.string.order_add)} · ${Money.format(item.priceCents * qty)}".uppercase(), style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReviewSheet(draft: OrderDraft, onChange: (OrderDraft) -> Unit, onSubmit: () -> Unit, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(
            Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = Spacing.l),
            verticalArrangement = Arrangement.spacedBy(Spacing.m),
        ) {
            if (draft.isEmpty) {
                Text(stringResource(R.string.order_empty), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            draft.lines.forEach { line ->
                HorizontalDivider(color = BarLabColors.LineFaint)
                Row(verticalAlignment = Alignment.Top) {
                    Text(line.name, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    Text(Money.format(line.totalCents), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                }
                QtyStepper(line.qty, { onChange(draft.setQty(line.lineId, it)) }, min = 0)
                OutlinedTextField(
                    value = line.note,
                    onValueChange = { onChange(draft.setLineNote(line.lineId, it.take(120))) },
                    label = { Text(stringResource(R.string.order_item_note)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            OutlinedTextField(
                value = draft.note,
                onValueChange = { onChange(draft.withNote(it.take(300))) },
                label = { Text(stringResource(R.string.order_order_note)) },
                modifier = Modifier.fillMaxWidth(),
            )
            Button(onClick = onSubmit, enabled = !draft.isEmpty, modifier = Modifier.fillMaxWidth().padding(bottom = Spacing.l)) {
                Text(stringResource(R.string.order_submit, Money.format(draft.totalCents)).uppercase(), style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}
