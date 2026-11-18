package gr.barlab.negroni.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import gr.barlab.negroni.R
import gr.barlab.negroni.auth.StaffUser
import gr.barlab.negroni.catalog.CatalogRepository
import gr.barlab.negroni.catalog.Menu
import gr.barlab.negroni.catalog.ReceiptHeader
import gr.barlab.negroni.domain.Round
import gr.barlab.negroni.domain.TableStatus
import gr.barlab.negroni.orders.OrdersRepository
import gr.barlab.negroni.orders.OrdersRepository.Action
import gr.barlab.negroni.sync.SyncMonitor
import gr.barlab.negroni.sync.SyncStatus
import gr.barlab.negroni.ui.components.MessageScreen
import gr.barlab.negroni.ui.components.SyncBanner
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import gr.barlab.negroni.ui.home.HomeScreen
import gr.barlab.negroni.ui.nav.rememberNavigator
import gr.barlab.negroni.ui.nav.Screen
import gr.barlab.negroni.shift.Shift
import gr.barlab.negroni.shift.ShiftAccess
import gr.barlab.negroni.shift.ShiftRepository
import gr.barlab.negroni.ui.order.NewOrderScreen
import gr.barlab.negroni.ui.shift.PermissionScreen
import gr.barlab.negroni.ui.shift.RequestPopup
import gr.barlab.negroni.ui.shift.StaffScreen
import gr.barlab.negroni.ui.admin.UsersScreen
import gr.barlab.negroni.admin.UsersRepository
import gr.barlab.negroni.auth.Role
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.foundation.layout.fillMaxWidth
import gr.barlab.negroni.ui.theme.BarLabColors
import gr.barlab.negroni.ui.theme.Spacing
import kotlinx.coroutines.flow.map
import gr.barlab.negroni.ui.settings.SettingsScreen
import gr.barlab.negroni.auth.PhoneRepository
import gr.barlab.negroni.auth.Fingerprint
import gr.barlab.negroni.ui.auth.FingerprintOffer
import gr.barlab.negroni.profile.ProfileRepository
import gr.barlab.negroni.ui.auth.SetPinScreen
import gr.barlab.negroni.ui.catalog.MenuScreen
import gr.barlab.negroni.ui.home.homeTabs
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import gr.barlab.negroni.ui.table.TableScreen

/** Everything after sign-in: one live subscription each for tables, menu and table states. */
@Composable
fun SignedInApp(
    user: StaffUser,
    catalog: CatalogRepository,
    orders: OrdersRepository,
    shifts: ShiftRepository,
    users: UsersRepository?,
    profiles: ProfileRepository?,
    phone: PhoneRepository,
    fingerprint: Fingerprint?,
    sync: SyncMonitor?,
    nowMs: Long,
    shiftOver: Boolean,
    onSwitchUser: () -> Unit,
    onRemoveFromPhone: () -> Unit,
) {
    val nav = rememberNavigator()
    // The Home tab lives here, not in HomeScreen, so it is still selected after a table, a new
    // order or Settings, and after Android stops the app in the background.
    var homeTab by rememberSaveable(user.uid) { mutableStateOf(homeTabs(user.role).first()) }
    val snackbar = remember { SnackbarHostState() }
    val resources = LocalResources.current
    val tables by catalog.tables.collectAsStateWithLifecycle(initialValue = emptyList())
    val menu by catalog.menu.collectAsStateWithLifecycle(initialValue = Menu(emptyList()))
    val syncStatus by (sync?.status ?: flowOf(SyncStatus.Synced)).collectAsStateWithLifecycle(initialValue = SyncStatus.Synced)
    val header by catalog.receiptHeader.collectAsStateWithLifecycle(initialValue = ReceiptHeader.DEFAULT)
    val sessionKey = tables.joinToString { it.currentSessionId }
    val states by remember(sessionKey) { orders.tableStates(tables) }.collectAsStateWithLifecycle(initialValue = emptyMap())
    // Pictures: live from the server once signed in; the grid's copy until that arrives.
    val gridPhotos by phone.photos.collectAsStateWithLifecycle()
    val livePhotos by remember { profiles?.photos ?: flowOf(emptyMap()) }.collectAsStateWithLifecycle(initialValue = emptyMap())
    val myPhoto = if (user.photoVersion == null) null else livePhotos[user.uid] ?: gridPhotos[user.uid]

    // Writes queued offline can still be refused once they reach the server; say so.
    LaunchedEffect(Unit) {
        orders.writeFailures.collect { f ->
            val res = when (f.action) {
                Action.Submit -> R.string.failure_submit
                Action.Edit -> R.string.failure_edit
                Action.Serve -> R.string.failure_serve
                Action.Unserve -> R.string.failure_unserve
                Action.Rebill -> R.string.failure_rebill
                Action.Cancel -> R.string.failure_cancel
                Action.Pay -> R.string.failure_pay
                Action.Reverse -> R.string.failure_reverse
                Action.Close -> R.string.failure_close
            }
            snackbar.showSnackbar(resources.getString(res, f.tableName))
        }
    }
    // Back: the previous screen. On Home with nowhere left to go, the app goes to the background
    // like the Home button instead of closing, so it reopens exactly where it was. (Home's own
    // handlers, for the drawer and the tabs, come later and so run first.)
    val activity = LocalActivity.current
    BackHandler(enabled = !nav.canGoBack) { activity?.moveTaskToBack(true) }
    BackHandler(enabled = nav.canGoBack) { nav.back() }

    // "Served" everywhere goes through here: serve, then offer Undo for 30 s (the rules allow 120 s).
    val scope = rememberCoroutineScope()
    val serveWithUndo: (Round) -> Unit = { round ->
        orders.serve(round, user)
        scope.launch {
            snackbar.currentSnackbarData?.dismiss()
            val result = withTimeoutOrNull(30_000) {
                snackbar.showSnackbar(
                    resources.getString(R.string.served_undo_message, round.tableName),
                    actionLabel = resources.getString(R.string.served_undo),
                    duration = SnackbarDuration.Indefinite,
                )
            }
            if (result == SnackbarResult.ActionPerformed) orders.unserve(round, user)
            else if (result == null) snackbar.currentSnackbarData?.dismiss()
        }
    }

    // Servers work only with today's permission (or the "works without asking" right).
    val myShift by remember(user.uid) { shifts.myShift(user.uid).map { MyShift(it) } }.collectAsStateWithLifecycle(initialValue = null)
    val canWork = ShiftAccess.canWork(user, myShift?.shift, nowMs)

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            Column {
                SyncBanner(syncStatus)
                if (shiftOver) ShiftOverBanner()
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            if (user.isLead) RequestPopup(user, shifts)
            if (fingerprint != null) FingerprintOffer(user, fingerprint)
            if (!canWork) {
                // Until the first snapshot arrives, show nothing rather than flash the request screen.
                if (myShift != null) PermissionScreen(user, myShift?.shift, nowMs, onRequest = { shifts.request(user) }, onSignOut = onSwitchUser)
                return@Box
            }
            when (val screen = nav.current) {
                Screen.Home -> HomeScreen(user, tables, states, orders, tab = homeTab, onTab = { homeTab = it }, onTableClick = { nav.go(Screen.Table(it.id)) }, onSettings = { nav.go(Screen.Settings) }, onServe = serveWithUndo, onStaff = { nav.go(Screen.Staff) }, onUsers = { nav.go(Screen.Users) }, nowMs = nowMs, photo = myPhoto, onSwitchUser = onSwitchUser)
                Screen.Settings -> SettingsScreen(
                    user, profiles, myPhoto, fingerprint,
                    onBack = nav::back,
                    onChangePin = { nav.go(Screen.ChangePin) },
                    onMenu = { nav.go(Screen.Menu) },
                    onSwitchUser = onSwitchUser,
                    onRemoveFromPhone = onRemoveFromPhone,
                )
                Screen.Menu -> MenuScreen(menu, onBack = nav::back, onSoldOut = { item, soldOut -> catalog.setSoldOut(item, soldOut, user.uid) })
                Screen.ChangePin -> SetPinScreen(
                    phone, user, changing = true,
                    onCancel = nav::back,
                    onDone = {
                        nav.back()
                        scope.launch { snackbar.showSnackbar(resources.getString(R.string.pin_changed)) }
                    },
                    cancelLabel = stringResource(R.string.back),
                )
                Screen.Staff -> StaffScreen(user, shifts, nowMs, onBack = nav::back)
                Screen.Users ->
                    if (users != null && user.role == Role.Admin) UsersScreen(user, users, shifts, profiles, phone.deviceId, nowMs, onBack = nav::back)
                    else LaunchedEffect(Unit) { nav.back() }
                is Screen.Table -> {
                    val table = tables.firstOrNull { it.id == screen.tableId }
                    if (table == null) MessageScreen(stringResource(R.string.table_not_found), onSignOut = null)
                    else TableScreen(
                        table, user, orders, header,
                        onBack = nav::back,
                        onNewOrder = { nav.go(Screen.NewOrder(table.id)) },
                        onServe = serveWithUndo,
                        freeTables = tables.filter { it.id != table.id && (states[it.id]?.status ?: TableStatus.Free) == TableStatus.Free },
                        onMove = { to ->
                            scope.launch {
                                catalog.moveTable(table, to)
                                    .onSuccess {
                                        nav.back()
                                        nav.go(Screen.Table(to.id))
                                        snackbar.showSnackbar(resources.getString(R.string.move_done, to.name))
                                    }
                                    .onFailure { snackbar.showSnackbar(resources.getString(R.string.move_failed, it.message.orEmpty())) }
                            }
                        },
                    )
                }
                is Screen.NewOrder -> {
                    val table = tables.firstOrNull { it.id == screen.tableId }
                    if (table == null) MessageScreen(stringResource(R.string.table_not_found), onSignOut = null)
                    else NewOrderScreen(table, menu, user.uid, onSubmit = { draft -> orders.submit(table, user, draft); nav.back() }, onBack = nav::back)
                }
            }
        }
    }
}

/** "Loaded" wrapper so the first snapshot (possibly no document) differs from "not loaded yet". */
private data class MyShift(val shift: Shift?)

/** 18:00 passed: the phone signs out as soon as everything is sent, so nothing is lost. */
@Composable
private fun ShiftOverBanner() {
    Text(
        stringResource(R.string.shift_over),
        style = MaterialTheme.typography.labelLarge,
        color = BarLabColors.Text,
        modifier = Modifier.fillMaxWidth().background(BarLabColors.Slate).padding(horizontal = Spacing.l, vertical = Spacing.s),
    )
}
