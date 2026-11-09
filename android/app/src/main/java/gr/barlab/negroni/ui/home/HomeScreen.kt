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
import gr.barlab.negroni.R
import gr.barlab.negroni.auth.Role
import gr.barlab.negroni.auth.StaffUser
import gr.barlab.negroni.catalog.DiningTable
import gr.barlab.negroni.catalog.Menu
import gr.barlab.negroni.domain.TableState
import gr.barlab.negroni.orders.OrdersRepository
import gr.barlab.negroni.ui.board.BoardScreen
import gr.barlab.negroni.ui.catalog.MenuList
import gr.barlab.negroni.ui.catalog.TablesGrid
import gr.barlab.negroni.ui.theme.Spacing

private enum class HomeTab(val label: Int) { Board(R.string.tab_board), Tables(R.string.tab_tables), Menu(R.string.tab_menu) }

/** Signed-in home: the order board (barman and admin only), the table grid (tap to order) and the menu. */
@Composable
fun HomeScreen(
    user: StaffUser,
    tables: List<DiningTable>,
    states: Map<String, TableState>,
    menu: Menu,
    orders: OrdersRepository,
    onTableClick: (DiningTable) -> Unit,
    onSignOut: () -> Unit,
) {
    val tabs = if (user.role.seesOrderBoard) HomeTab.entries else listOf(HomeTab.Tables, HomeTab.Menu)
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
        PrimaryTabRow(selectedTabIndex = tab.coerceIn(tabs.indices)) {
            tabs.forEachIndexed { i, t ->
                Tab(selected = tab == i, onClick = { tab = i }, text = { Text(stringResource(t.label).uppercase(), style = MaterialTheme.typography.labelLarge) })
            }
        }
        when (tabs[tab.coerceIn(tabs.indices)]) {
            HomeTab.Board -> BoardScreen(user, orders)
            HomeTab.Tables -> TablesGrid(tables, states, onTableClick)
            HomeTab.Menu -> MenuList(menu)
        }
    }
}

fun roleLabel(role: Role) = when (role) {
    Role.Admin -> R.string.role_admin
    Role.Barman -> R.string.role_barman
    Role.Server -> R.string.role_server
}
