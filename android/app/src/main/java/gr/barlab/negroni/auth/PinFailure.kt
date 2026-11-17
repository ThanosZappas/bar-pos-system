package gr.barlab.negroni.auth

/**
 * Why a PIN step failed, from the `details.reason` the Cloud Functions send (functions/src/pins.ts
 * and devices.ts). Pure Kotlin so it is unit-tested; [PhoneRepository] turns exceptions into it.
 */
sealed interface PinFailure {
    data class WrongPin(val triesLeft: Int, val lockedUntilMs: Long?) : PinFailure
    data class Locked(val untilMs: Long) : PinFailure
    /** The profile has no PIN yet (new, or reset by the admin): sign in with the password. */
    data object NoPin : PinFailure
    /** The PIN was entered on a session opened with a PIN, but the change needs the password. */
    data object NeedPassword : PinFailure
    data object CurrentPinNeeded : PinFailure
    data class BadFormat(val min: Int, val max: Int) : PinFailure
    /** This phone's key is unknown (removed by the admin): sign in with the password again. */
    data object PhoneRemoved : PinFailure
    data object NotOnPhone : PinFailure
    data object Deactivated : PinFailure
    data object LoginNotAllowed : PinFailure
    data object Gone : PinFailure
    data object BiometricOff : PinFailure
    data object SharedPhone : PinFailure
    data object Network : PinFailure
    data class Unknown(val message: String?) : PinFailure

    companion object {
        fun from(code: String?, details: Any?, message: String?): PinFailure {
            val d = details as? Map<*, *>
            fun long(key: String) = (d?.get(key) as? Number)?.toLong()
            return when (d?.get("reason") as? String) {
                "wrongPin" -> WrongPin(long("triesLeft")?.toInt() ?: 0, long("lockedUntilMs"))
                "locked" -> Locked(long("lockedUntilMs") ?: 0)
                "noPin" -> NoPin
                "needPassword" -> NeedPassword
                "currentPin" -> CurrentPinNeeded
                "pinFormat" -> BadFormat(long("min")?.toInt() ?: PinRules.SERVER_MIN, long("max")?.toInt() ?: PinRules.MAX)
                "device" -> PhoneRemoved
                "notOnDevice" -> NotOnPhone
                "deactivated" -> Deactivated
                "loginNotAllowed" -> LoginNotAllowed
                "gone" -> Gone
                "biometric" -> BiometricOff
                "sharedPhone" -> SharedPhone
                else -> if (code == "UNAVAILABLE" || code == "DEADLINE_EXCEEDED") Network else Unknown(message)
            }
        }
    }
}

class PinException(val failure: PinFailure) : Exception(failure.toString())
