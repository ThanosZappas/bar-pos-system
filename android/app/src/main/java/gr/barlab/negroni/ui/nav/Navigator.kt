package gr.barlab.negroni.ui.nav

import androidx.compose.runtime.mutableStateListOf

/** Screens of the signed-in app. */
sealed interface Screen {
    data object Home : Screen
    data class Table(val tableId: String) : Screen
    data class NewOrder(val tableId: String) : Screen
    data object Settings : Screen
}

/**
 * A plain back stack held as Compose state. The app has a handful of screens and no deep links,
 * so this replaces a navigation library (one dependency fewer).
 */
class Navigator {
    val stack = mutableStateListOf<Screen>(Screen.Home)
    val current: Screen get() = stack.last()
    val canGoBack: Boolean get() = stack.size > 1

    fun go(screen: Screen) {
        stack.add(screen)
    }

    fun back() {
        if (canGoBack) stack.removeAt(stack.lastIndex)
    }
}
