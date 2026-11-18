package gr.barlab.negroni.auth

enum class Role(val wire: String) {
    Admin("admin"),
    Barman("barman"),
    Server("server");

    /** Admin and barman see the live order board and can change round statuses. */
    val seesOrderBoard: Boolean get() = this != Server

    companion object {
        fun fromWire(value: String?): Role? = entries.firstOrNull { it.wire == value }
    }
}

data class StaffUser(
    val uid: String,
    val username: String,
    val displayName: String,
    val role: Role,
    val mustChangePassword: Boolean,
    val rights: Rights = Rights(),
    /** Chosen icon id (null: the role's default) and picture version (null: no picture). */
    val icon: String? = null,
    val photoVersion: Long? = null,
    /** Has chosen a PIN; until then the app asks for one right after sign-in. */
    val pinSet: Boolean = true,
) {
    /** Barman and admin run the bar: they never ask for permission and have every right. */
    val isLead: Boolean get() = role != Role.Server

    fun may(right: (Rights) -> Boolean): Boolean = isLead || right(rights)
}

/**
 * What a server may do, set by the admin in the dashboard. Defaults match the Firestore rules and
 * worker/src/users.ts RIGHT_DEFAULTS: everything allowed except working without approval.
 */
data class Rights(
    val logIn: Boolean = true,
    val noApproval: Boolean = false,
    val payments: Boolean = true,
    val reversePayments: Boolean = true,
    val closeTables: Boolean = true,
    val cancelOrders: Boolean = true,
    val moveTables: Boolean = true,
) {
    companion object {
        fun from(map: Map<*, *>?): Rights {
            fun flag(key: String, default: Boolean) = map?.get(key) as? Boolean ?: default
            val d = Rights()
            return Rights(
                logIn = flag("logIn", d.logIn),
                noApproval = flag("noApproval", d.noApproval),
                payments = flag("payments", d.payments),
                reversePayments = flag("reversePayments", d.reversePayments),
                closeTables = flag("closeTables", d.closeTables),
                cancelOrders = flag("cancelOrders", d.cancelOrders),
                moveTables = flag("moveTables", d.moveTables),
            )
        }
    }
}

sealed interface Session {
    data object Loading : Session
    data object SignedOut : Session
    data class Active(val user: StaffUser) : Session
    data object Deactivated : Session
    /** Signed in to Auth but there is no usable profile document (not seeded or unknown role). */
    data object NoProfile : Session
    /** A server whose "can sign in" right is off. */
    data object LoginNotAllowed : Session
}
