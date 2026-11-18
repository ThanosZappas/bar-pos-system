package gr.barlab.negroni.auth

/**
 * Every PIN is exactly 4 digits, for every role, and any digits are allowed
 * (worker/src/pinPolicy.ts checks the same on the server).
 */
object PinRules {
    const val LENGTH = 4

    fun isValid(pin: String): Boolean = pin.length == LENGTH && pin.all { it in '0'..'9' }
}
