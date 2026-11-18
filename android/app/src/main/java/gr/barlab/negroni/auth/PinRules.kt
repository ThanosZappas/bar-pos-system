package gr.barlab.negroni.auth

/**
 * PIN length (worker/src/pinPolicy.ts checks the same on the server). Any digits are allowed;
 * admin and barman need a longer PIN.
 */
object PinRules {
    const val SERVER_MIN = 4
    const val LEAD_MIN = 6
    const val MAX = 8

    fun minLength(role: Role): Int = if (role == Role.Server) SERVER_MIN else LEAD_MIN

    fun isValid(pin: String, role: Role): Boolean = pin.length in minLength(role)..MAX && pin.all { it in '0'..'9' }
}
