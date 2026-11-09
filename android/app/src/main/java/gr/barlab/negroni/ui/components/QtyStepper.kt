package gr.barlab.negroni.ui.components

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import gr.barlab.negroni.R
import gr.barlab.negroni.domain.OrderLine

/** − qty + with large touch targets (used with wet hands, in the dark). */
@Composable
fun QtyStepper(qty: Int, onChange: (Int) -> Unit, min: Int = 0, enabled: Boolean = true) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        val minus = stringResource(R.string.qty_decrease)
        val plus = stringResource(R.string.qty_increase)
        OutlinedButton(onClick = { onChange(qty - 1) }, enabled = enabled && qty > min, modifier = Modifier.semantics { contentDescription = minus }) { Text("−") }
        Text("$qty", style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center, modifier = Modifier.widthIn(min = 40.dp))
        OutlinedButton(onClick = { onChange(qty + 1) }, enabled = enabled && qty < OrderLine.MAX_QTY, modifier = Modifier.semantics { contentDescription = plus }) { Text("+") }
    }
}
