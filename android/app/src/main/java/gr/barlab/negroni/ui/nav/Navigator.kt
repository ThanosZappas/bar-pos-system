package gr.barlab.negroni.ui.nav

import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable

/** Screens of the signed-in app. */
sealed interface Screen {
    data object Home : Screen
    data class Table(val tableId: String) : Screen
    data class NewOrder(val tableId: String) : Screen
    data object Settings : Screen
    data object Staff : Screen
    data object Users : Screen
}

/**
 * A plain back stack held as Compose state. The app has a handful of screens and no deep links,
 * so this replaces a navigation library (one dependency fewer).
 */
class Navigator(initial: List<Screen> = listOf(Screen.Home)) {
    val stack = mutableStateListOf<Screen>().apply { addAll(initial.ifEmpty { listOf(Screen.Home) }) }
    val current: Screen get() = stack.last()
    val canGoBack: Boolean get() = stack.size > 1

    fun go(screen: Screen) {
        stack.add(screen)
    }

    fun back() {
        if (canGoBack) stack.removeAt(stack.lastIndex)
    }
}

/** Screens as short strings, so the back stack survives rotation and a language change. */
internal object ScreenCodec {
    fun encode(s: Screen): String = when (s) {
        Screen.Home -> "home"
        Screen.Settings -> "settings"
        Screen.Staff -> "staff"
        Screen.Users -> "users"
        is Screen.Table -> "table:${s.tableId}"
        is Screen.NewOrder -> "order:${s.tableId}"
    }

    fun decode(code: String): Screen? = when {
        code == "home" -> Screen.Home
        code == "settings" -> Screen.Settings
        code == "staff" -> Screen.Staff
        code == "users" -> Screen.Users
        code.startsWith("table:") -> Screen.Table(code.removePrefix("table:"))
        code.startsWith("order:") -> Screen.NewOrder(code.removePrefix("order:"))
        else -> null
    }
}

private val NavigatorSaver = Saver<Navigator, ArrayList<String>>(
    save = { nav -> ArrayList(nav.stack.map(ScreenCodec::encode)) },
    restore = { codes -> Navigator(codes.mapNotNull(ScreenCodec::decode)) },
)

@Composable
fun rememberNavigator(): Navigator = rememberSaveable(saver = NavigatorSaver) { Navigator() }
