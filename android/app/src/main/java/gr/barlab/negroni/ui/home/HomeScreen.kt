package gr.barlab.negroni.ui.home

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import gr.barlab.negroni.R
import gr.barlab.negroni.auth.Role
import gr.barlab.negroni.auth.StaffUser
import gr.barlab.negroni.catalog.DiningTable
import gr.barlab.negroni.domain.Round
import gr.barlab.negroni.domain.TableState
import gr.barlab.negroni.orders.OrdersRepository
import gr.barlab.negroni.ui.admin.PaymentsTab
import gr.barlab.negroni.ui.board.BoardScreen
import gr.barlab.negroni.ui.catalog.TablesGrid
import gr.barlab.negroni.ui.components.caps
import gr.barlab.negroni.ui.profile.ProfileAvatar
import gr.barlab.negroni.ui.profile.iconOf
import gr.barlab.negroni.ui.theme.BarLabColors
import gr.barlab.negroni.ui.theme.Spacing
import kotlinx.coroutines.launch

enum class HomeTab(val label: Int) { Board(R.string.tab_board), Tables(R.string.tab_tables), Payments(R.string.tab_payments) }

/** The tabs a role sees, first one is where the app opens. The menu lives under Settings → Menu. */
fun homeTabs(role: Role): List<HomeTab> = when (role) {
    Role.Admin -> HomeTab.entries
    Role.Barman -> listOf(HomeTab.Board, HomeTab.Tables)
    Role.Server -> listOf(HomeTab.Tables)
}

/**
 * Signed-in home: the wordmark centred, and a menu button on the right that opens a drawer with
 * who is signed in, Users / Staff, Settings and Switch user. [tab] is kept by the caller, so it
 * survives opening a table, a new order, or leaving the app.
 */
@Composable
fun HomeScreen(
    user: StaffUser,
    tables: List<DiningTable>,
    states: Map<String, TableState>,
    orders: OrdersRepository,
    tab: HomeTab,
    onTab: (HomeTab) -> Unit,
    onTableClick: (DiningTable) -> Unit,
    onSettings: () -> Unit,
    onServe: (Round) -> Unit,
    onStaff: () -> Unit,
    onUsers: () -> Unit,
    nowMs: Long,
    photo: ImageBitmap?,
    onSwitchUser: () -> Unit,
) {
    val tabs = homeTabs(user.role)
    val current = tab.takeIf { it in tabs } ?: tabs.first()
    val drawer = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    fun closeThen(action: () -> Unit) {
        scope.launch { drawer.close() }
        action()
    }

    // The drawer slides in from the right: lay the drawer out right-to-left, its contents left-to-right.
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
        ModalNavigationDrawer(
            drawerState = drawer,
            gesturesEnabled = drawer.isOpen,
            drawerContent = {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    ModalDrawerSheet(drawerContainerColor = BarLabColors.Bg, modifier = Modifier.width(300.dp)) {
                        Column(Modifier.padding(Spacing.l), horizontalAlignment = Alignment.CenterHorizontally) {
                            ProfileAvatar(iconOf(user.icon, user.role), photo, 72.dp)
                            Text(user.displayName, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = Spacing.m))
                            Text(stringResource(roleLabel(user.role)).caps(), style = MaterialTheme.typography.labelMedium, color = BarLabColors.Muted)
                        }
                        HorizontalDivider(color = BarLabColors.Line)
                        val itemColors = NavigationDrawerItemDefaults.colors(unselectedContainerColor = BarLabColors.Bg, unselectedTextColor = BarLabColors.Text)
                        if (user.role == Role.Admin) {
                            NavigationDrawerItem(label = { Text(stringResource(R.string.users)) }, selected = false, onClick = { closeThen(onUsers) }, colors = itemColors)
                        } else if (user.isLead) {
                            NavigationDrawerItem(label = { Text(stringResource(R.string.staff)) }, selected = false, onClick = { closeThen(onStaff) }, colors = itemColors)
                        }
                        NavigationDrawerItem(label = { Text(stringResource(R.string.settings)) }, selected = false, onClick = { closeThen(onSettings) }, colors = itemColors)
                        NavigationDrawerItem(label = { Text(stringResource(R.string.switch_user)) }, selected = false, onClick = { closeThen(onSwitchUser) }, colors = itemColors)
                    }
                }
            },
        ) {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Column(Modifier.fillMaxSize()) {
                    Box(Modifier.fillMaxWidth().height(56.dp)) {
                        Text(
                            stringResource(R.string.brand_wordmark),
                            style = MaterialTheme.typography.headlineSmall,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.align(Alignment.Center),
                        )
                        IconButton(onClick = { scope.launch { drawer.open() } }, modifier = Modifier.align(Alignment.CenterEnd).padding(end = Spacing.xs)) {
                            Icon(painterResource(R.drawable.ic_menu_lines), contentDescription = stringResource(R.string.menu_open), tint = BarLabColors.Gold, modifier = Modifier.size(26.dp))
                        }
                    }
                    if (tabs.size > 1) {
                        PrimaryTabRow(selectedTabIndex = tabs.indexOf(current)) {
                            tabs.forEach { t ->
                                Tab(
                                    selected = t == current,
                                    onClick = { onTab(t) },
                                    text = { Text(stringResource(t.label).caps(), style = MaterialTheme.typography.labelLarge, maxLines = 1, softWrap = false) },
                                )
                            }
                        }
                    } else {
                        HorizontalDivider(color = BarLabColors.Line)
                    }
                    when (current) {
                        HomeTab.Board -> BoardScreen(user, orders, tables, onServe)
                        HomeTab.Tables -> TablesGrid(tables, states, onTableClick)
                        HomeTab.Payments -> PaymentsTab(orders, nowMs)
                    }
                }
            }
        }
    }
}

fun roleLabel(role: Role) = when (role) {
    Role.Admin -> R.string.role_admin
    Role.Barman -> R.string.role_barman
    Role.Server -> R.string.role_server
}
