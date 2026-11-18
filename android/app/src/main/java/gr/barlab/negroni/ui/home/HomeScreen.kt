package gr.barlab.negroni.ui.home

import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role as SemanticsRole
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.unit.dp
import gr.barlab.negroni.BuildConfig
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
 * Signed-in home. Top: "Negroni / BAR LAB" centred, and a menu button that opens the drawer on the
 * right (who is signed in, Switch user in red, Users / Staff, Settings). Tabs change by tapping or
 * swiping; swiping on past the last tab opens the drawer. [tab] is kept by the caller, so it
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
    val drawer = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val pager = rememberPagerState(initialPage = tabs.indexOf(tab).coerceAtLeast(0)) { tabs.size }
    LaunchedEffect(pager.settledPage) { onTab(tabs[pager.settledPage]) }

    // Swiping on to the left on the last tab pulls the drawer out, like a page after the last one.
    val pullThreshold = with(LocalDensity.current) { 56.dp.toPx() }
    val pullToDrawer = remember(pager, drawer) {
        object : NestedScrollConnection {
            var pulled = 0f
            override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
                if (source != NestedScrollSource.UserInput || available.x >= 0f || pager.currentPage != tabs.lastIndex) return Offset.Zero
                pulled += available.x
                if (pulled < -pullThreshold && !drawer.isOpen) {
                    pulled = 0f
                    scope.launch { drawer.open() }
                }
                return Offset(available.x, 0f)
            }

            override suspend fun onPreFling(available: Velocity): Velocity {
                pulled = 0f
                return Velocity.Zero
            }
        }
    }

    fun closeThen(action: () -> Unit) {
        scope.launch { drawer.close() }
        action()
    }

    // The drawer slides in from the right: lay the drawer out right-to-left, its contents left-to-right.
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
        ModalNavigationDrawer(
            drawerState = drawer,
            gesturesEnabled = drawer.isOpen,
            scrimColor = Color.Black.copy(alpha = 0.6f),
            drawerContent = {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    DrawerContent(
                        user = user,
                        photo = photo,
                        onUsers = { closeThen(onUsers) },
                        onStaff = { closeThen(onStaff) },
                        onSettings = { closeThen(onSettings) },
                        onSwitchUser = { closeThen(onSwitchUser) },
                    )
                }
            },
        ) {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Column(Modifier.fillMaxSize()) {
                    Box(Modifier.fillMaxWidth().height(64.dp)) {
                        Wordmark(Modifier.align(Alignment.Center))
                        IconButton(onClick = { scope.launch { drawer.open() } }, modifier = Modifier.align(Alignment.CenterEnd).padding(end = Spacing.xs)) {
                            Icon(painterResource(R.drawable.ic_menu_lines), contentDescription = stringResource(R.string.menu_open), tint = BarLabColors.Gold, modifier = Modifier.size(26.dp))
                        }
                    }
                    if (tabs.size > 1) {
                        PrimaryTabRow(selectedTabIndex = pager.currentPage) {
                            tabs.forEachIndexed { i, t ->
                                Tab(
                                    selected = pager.currentPage == i,
                                    onClick = { scope.launch { pager.animateScrollToPage(i) } },
                                    text = { Text(stringResource(t.label).caps(), style = MaterialTheme.typography.labelLarge, maxLines = 1, softWrap = false) },
                                )
                            }
                        }
                    } else {
                        HorizontalDivider(color = BarLabColors.Line)
                    }
                    HorizontalPager(
                        state = pager,
                        overscrollEffect = null, // the pull past the last tab goes to the drawer instead
                        modifier = Modifier.weight(1f).nestedScroll(pullToDrawer),
                    ) { page ->
                        when (tabs[page]) {
                            HomeTab.Board -> BoardScreen(user, orders, tables, onServe)
                            HomeTab.Tables -> TablesGrid(tables, states, onTableClick)
                            HomeTab.Payments -> PaymentsTab(orders, nowMs)
                        }
                    }
                }
            }
        }
    }
}

/** "Negroni" in the script over a spaced "BAR LAB", like the site's header. */
@Composable
private fun Wordmark(modifier: Modifier = Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(stringResource(R.string.brand_wordmark), style = MaterialTheme.typography.headlineSmall, color = BarLabColors.Gold)
        Text(
            stringResource(R.string.brand_subtitle).caps(),
            style = MaterialTheme.typography.labelSmall,
            color = BarLabColors.Muted,
            modifier = Modifier.padding(top = 0.dp),
        )
    }
}

@Composable
private fun DrawerContent(
    user: StaffUser,
    photo: ImageBitmap?,
    onUsers: () -> Unit,
    onStaff: () -> Unit,
    onSettings: () -> Unit,
    onSwitchUser: () -> Unit,
) {
    ModalDrawerSheet(
        drawerContainerColor = BarLabColors.Bg,
        drawerShape = androidx.compose.foundation.shape.RoundedCornerShape(0.dp),
        modifier = Modifier.width(310.dp).border(1.dp, BarLabColors.Line),
    ) {
        Column(Modifier.fillMaxHeight()) {
            Wordmark(Modifier.align(Alignment.CenterHorizontally).padding(top = Spacing.xxl, bottom = Spacing.l))
            HorizontalDivider(color = BarLabColors.Gold.copy(alpha = 0.5f), modifier = Modifier.padding(horizontal = Spacing.xxl))

            // Who is signed in, with Switch user next to them, in red like a sign-out.
            Row(
                Modifier.fillMaxWidth().padding(Spacing.l).background(BarLabColors.GoldTint).border(1.dp, BarLabColors.Line).padding(Spacing.m),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ProfileAvatar(iconOf(user.icon, user.role), photo, 56.dp)
                Column(Modifier.weight(1f).padding(horizontal = Spacing.m)) {
                    Text(user.displayName, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(stringResource(roleLabel(user.role)).caps(), style = MaterialTheme.typography.labelSmall, color = BarLabColors.Muted)
                }
                Column(
                    Modifier.clickable(role = SemanticsRole.Button, onClick = onSwitchUser).border(1.dp, BarLabColors.Error.copy(alpha = 0.6f)).padding(horizontal = Spacing.s, vertical = Spacing.xs),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(painterResource(R.drawable.ic_nav_logout), contentDescription = null, tint = BarLabColors.Error, modifier = Modifier.size(24.dp))
                    Text(stringResource(R.string.switch_user), style = MaterialTheme.typography.labelSmall, color = BarLabColors.Error, maxLines = 1)
                }
            }

            if (user.role == Role.Admin) DrawerRow(R.drawable.ic_nav_users, stringResource(R.string.users), onUsers)
            else if (user.isLead) DrawerRow(R.drawable.ic_nav_staff, stringResource(R.string.staff), onStaff)
            DrawerRow(R.drawable.ic_nav_settings, stringResource(R.string.settings), onSettings)

            Spacer(Modifier.weight(1f))
            Text(
                stringResource(R.string.settings_version, BuildConfig.VERSION_NAME),
                style = MaterialTheme.typography.labelSmall,
                color = BarLabColors.Faint,
                modifier = Modifier.align(Alignment.CenterHorizontally).padding(Spacing.l),
            )
        }
    }
}

@Composable
private fun DrawerRow(@DrawableRes icon: Int, label: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().height(56.dp).clickable(role = SemanticsRole.Button, onClick = onClick).padding(horizontal = Spacing.xxl),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.l),
    ) {
        Icon(painterResource(icon), contentDescription = null, tint = BarLabColors.Gold, modifier = Modifier.size(22.dp))
        Text(label.caps(), style = MaterialTheme.typography.labelLarge, color = BarLabColors.Text)
    }
    HorizontalDivider(color = BarLabColors.LineFaint, modifier = Modifier.padding(horizontal = Spacing.xxl))
}

fun roleLabel(role: Role) = when (role) {
    Role.Admin -> R.string.role_admin
    Role.Barman -> R.string.role_barman
    Role.Server -> R.string.role_server
}
