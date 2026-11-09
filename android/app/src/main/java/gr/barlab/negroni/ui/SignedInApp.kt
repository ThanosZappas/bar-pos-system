package gr.barlab.negroni.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import gr.barlab.negroni.R
import gr.barlab.negroni.auth.StaffUser
import gr.barlab.negroni.catalog.CatalogRepository
import gr.barlab.negroni.catalog.Menu
import gr.barlab.negroni.orders.OrdersRepository
import gr.barlab.negroni.orders.OrdersRepository.Action
import gr.barlab.negroni.ui.components.MessageScreen
import gr.barlab.negroni.ui.home.HomeScreen
import gr.barlab.negroni.ui.nav.Navigator
import gr.barlab.negroni.ui.nav.Screen
import gr.barlab.negroni.ui.order.NewOrderScreen
import gr.barlab.negroni.ui.table.TableScreen

/** Everything after sign-in: one live subscription each for tables, menu and table states. */
@Composable
fun SignedInApp(user: StaffUser, catalog: CatalogRepository, orders: OrdersRepository, onSignOut: () -> Unit) {
    val nav = remember { Navigator() }
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    val tables by catalog.tables.collectAsStateWithLifecycle(initialValue = emptyList())
    val menu by catalog.menu.collectAsStateWithLifecycle(initialValue = Menu(emptyList()))
    val sessionKey = tables.joinToString { it.currentSessionId }
    val states by remember(sessionKey) { orders.tableStates(tables) }.collectAsStateWithLifecycle(initialValue = emptyMap())

    // Writes queued offline can still be refused once they reach the server; say so.
    LaunchedEffect(Unit) {
        orders.writeFailures.collect { f ->
            val res = when (f.action) {
                Action.Submit -> R.string.failure_submit
                Action.Edit -> R.string.failure_edit
                Action.Serve -> R.string.failure_serve
                Action.Cancel -> R.string.failure_cancel
            }
            snackbar.showSnackbar(context.getString(res, f.tableName))
        }
    }
    BackHandler(enabled = nav.canGoBack) { nav.back() }

    Scaffold(snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when (val screen = nav.current) {
                Screen.Home -> HomeScreen(user, tables, states, menu, onTableClick = { nav.go(Screen.Table(it.id)) }, onSignOut = onSignOut)
                is Screen.Table -> {
                    val table = tables.firstOrNull { it.id == screen.tableId }
                    if (table == null) MessageScreen(stringResource(R.string.table_not_found), onSignOut = null)
                    else TableScreen(table, user, orders, onBack = nav::back, onNewOrder = { nav.go(Screen.NewOrder(table.id)) })
                }
                is Screen.NewOrder -> {
                    val table = tables.firstOrNull { it.id == screen.tableId }
                    if (table == null) MessageScreen(stringResource(R.string.table_not_found), onSignOut = null)
                    else NewOrderScreen(table, menu, onSubmit = { draft -> orders.submit(table, user, draft); nav.back() }, onBack = nav::back)
                }
            }
        }
    }
}
