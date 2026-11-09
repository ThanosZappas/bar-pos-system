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
)

sealed interface Session {
    data object Loading : Session
    data object SignedOut : Session
    data class Active(val user: StaffUser) : Session
    data object Deactivated : Session
    /** Signed in to Auth but there is no usable profile document (not seeded or unknown role). */
    data object NoProfile : Session
}
