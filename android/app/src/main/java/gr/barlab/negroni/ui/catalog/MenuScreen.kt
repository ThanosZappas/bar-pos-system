package gr.barlab.negroni.ui.catalog

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import gr.barlab.negroni.R
import gr.barlab.negroni.catalog.Menu
import gr.barlab.negroni.ui.theme.BarLabColors
import gr.barlab.negroni.ui.theme.Spacing

/** Settings → Menu: the whole menu, where anyone on shift marks an item sold out or available again. */
@Composable
fun MenuScreen(menu: Menu, onBack: () -> Unit, onSoldOut: (Menu.Item, Boolean) -> Unit) {
    Column(Modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹ " + stringResource(R.string.back)) }
            Text(stringResource(R.string.tab_menu), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
        }
        Text(
            stringResource(R.string.menu_sold_out_hint),
            style = MaterialTheme.typography.bodySmall,
            color = BarLabColors.Muted,
            modifier = Modifier.padding(horizontal = Spacing.l),
        )
        MenuList(menu, modifier = Modifier.weight(1f), onSoldOut = onSoldOut)
    }
}
