package gr.barlab.negroni.ui.home

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import gr.barlab.negroni.R
import gr.barlab.negroni.auth.Role
import gr.barlab.negroni.auth.StaffUser
import gr.barlab.negroni.catalog.CatalogRepository
import gr.barlab.negroni.catalog.Menu
import gr.barlab.negroni.ui.catalog.MenuList
import gr.barlab.negroni.ui.catalog.TablesGrid
import gr.barlab.negroni.ui.theme.Spacing

/** Signed-in home: tables and the live menu. Ordering arrives in milestone 4, the board in 5. */
@Composable
fun HomeScreen(user: StaffUser, catalog: CatalogRepository, onSignOut: () -> Unit) {
    val tables by catalog.tables.collectAsStateWithLifecycle(initialValue = emptyList())
    val menu by catalog.menu.collectAsStateWithLifecycle(initialValue = Menu(emptyList()))
    var tab by rememberSaveable { mutableIntStateOf(0) }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(start = Spacing.l, end = Spacing.s), verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.brand_wordmark), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
            Text(
                "${user.displayName} · ${stringResource(roleLabel(user.role))}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f).padding(start = Spacing.m),
                maxLines = 1,
            )
            TextButton(onClick = onSignOut) { Text(stringResource(R.string.sign_out)) }
        }
        PrimaryTabRow(selectedTabIndex = tab) {
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text(stringResource(R.string.tab_tables).uppercase(), style = MaterialTheme.typography.labelLarge) })
            Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text(stringResource(R.string.tab_menu).uppercase(), style = MaterialTheme.typography.labelLarge) })
        }
        when (tab) {
            0 -> TablesGrid(tables)
            else -> MenuList(menu)
        }
    }
}

fun roleLabel(role: Role) = when (role) {
    Role.Admin -> R.string.role_admin
    Role.Barman -> R.string.role_barman
    Role.Server -> R.string.role_server
}
