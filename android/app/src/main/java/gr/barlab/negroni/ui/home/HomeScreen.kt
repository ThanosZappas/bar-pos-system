package gr.barlab.negroni.ui.home

import gr.barlab.negroni.ui.components.caps
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PrimaryScrollableTabRow
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
import gr.barlab.negroni.domain.Round
import gr.barlab.negroni.domain.TableState
import gr.barlab.negroni.orders.OrdersRepository
import gr.barlab.negroni.ui.admin.PaymentsTab
import gr.barlab.negroni.ui.board.BoardScreen
import gr.barlab.negroni.ui.catalog.MenuList
import gr.barlab.negroni.ui.catalog.TablesGrid
import gr.barlab.negroni.ui.theme.Spacing

private enum class HomeTab(val label: Int) { Board(R.string.tab_board), Tables(R.string.tab_tables), Menu(R.string.tab_menu), Payments(R.string.tab_payments) }

/** Signed-in home: the order board (barman and admin only), the table grid (tap to order) and the menu. */
@Composable
fun HomeScreen(
    user: StaffUser,
    tables: List<DiningTable>,
    states: Map<String, TableState>,
    menu: Menu,
    orders: OrdersRepository,
    onTableClick: (DiningTable) -> Unit,
    onSettings: () -> Unit,
    onServe: (Round) -> Unit,
    onStaff: () -> Unit,
    onUsers: () -> Unit,
    nowMs: Long,
) {
    val tabs = when (user.role) {
        Role.Admin -> HomeTab.entries
        Role.Barman -> listOf(HomeTab.Board, HomeTab.Tables, HomeTab.Menu)
        Role.Server -> listOf(HomeTab.Tables, HomeTab.Menu)
    }
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
            // The admin manages users (with each server's shift permission); the barman only permissions.
            if (user.role == Role.Admin) TextButton(onClick = onUsers) { Text(stringResource(R.string.users)) }
            else if (user.isLead) TextButton(onClick = onStaff) { Text(stringResource(R.string.staff)) }
            TextButton(onClick = onSettings) { Text(stringResource(R.string.settings)) }
        }
        // Four spaced-out labels (admin) do not fit a phone's width, so the row scrolls; never wrap a label.
        val tabItems: @Composable () -> Unit = {
            tabs.forEachIndexed { i, t ->
                Tab(
                    selected = tab == i,
                    onClick = { tab = i },
                    text = { Text(stringResource(t.label).caps(), style = MaterialTheme.typography.labelLarge, maxLines = 1, softWrap = false) },
                )
            }
        }
        if (tabs.size > 3) PrimaryScrollableTabRow(selectedTabIndex = tab.coerceIn(tabs.indices), edgePadding = Spacing.l, tabs = tabItems)
        else PrimaryTabRow(selectedTabIndex = tab.coerceIn(tabs.indices), tabs = tabItems)
        when (tabs[tab.coerceIn(tabs.indices)]) {
            HomeTab.Board -> BoardScreen(user, orders, tables, onServe)
            HomeTab.Tables -> TablesGrid(tables, states, onTableClick)
            HomeTab.Menu -> MenuList(menu)
            HomeTab.Payments -> PaymentsTab(orders, nowMs)
        }
    }
}

fun roleLabel(role: Role) = when (role) {
    Role.Admin -> R.string.role_admin
    Role.Barman -> R.string.role_barman
    Role.Server -> R.string.role_server
}
