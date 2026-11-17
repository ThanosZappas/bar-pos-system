package gr.barlab.negroni.auth

import androidx.fragment.app.FragmentActivity
import gr.barlab.negroni.auth.BiometricUnlock.Outcome

/**
 * Fingerprint unlock end to end: the server's secret ([PhoneRepository.setBiometric]) kept behind
 * the fingerprint ([BiometricUnlock]). Turning it on takes one touch to seal the secret.
 */
class Fingerprint(private val phone: PhoneRepository, private val biometric: BiometricUnlock) {
    sealed interface Result {
        data object Done : Result
        /** The person chose the PIN, or cancelled. */
        data object Cancelled : Result
        /** Fingerprints on the phone changed since it was turned on: use the PIN, turn it on again. */
        data object Changed : Result
        data class Refused(val failure: PinFailure) : Result
    }

    val isAvailable: Boolean get() = biometric.isAvailable

    fun isOn(uid: String) = biometric.isOn(uid)

    /** Only on a phone where this is the only profile: a fingerprint opens the whole phone. */
    fun canTurnOn(uid: String): Boolean = biometric.isAvailable && phone.profiles.value.map { it.uid } == listOf(uid)

    fun wasOffered(uid: String) = biometric.wasOffered(uid)
    fun markOffered(uid: String) = biometric.markOffered(uid)

    suspend fun turnOn(activity: FragmentActivity, uid: String, title: String, cancel: String): Result {
        val secret = phone.setBiometric(true).getOrElse { return refused(it) } ?: return Result.Refused(PinFailure.Unknown("no secret"))
        val stored = biometric.store(activity, uid, secret, title, cancel)
        if (stored !is Outcome.Done) phone.setBiometric(false)
        return stored.toResult()
    }

    suspend fun turnOff(uid: String): Result {
        biometric.forget(uid)
        return phone.setBiometric(false).fold({ Result.Done }, ::refused)
    }

    /** Touch, then sign in. A secret the server no longer accepts is forgotten here too. */
    suspend fun signIn(activity: FragmentActivity, uid: String, title: String, subtitle: String, cancel: String): Result =
        when (val r = biometric.unlock(activity, uid, title, subtitle, cancel)) {
            is Outcome.Done -> phone.signInWithBiometric(uid, r.value).fold({ Result.Done }) { e ->
                refused(e).also { if (it.failure == PinFailure.BiometricOff) biometric.forget(uid) }
            }
            else -> r.toResult()
        }

    /** The server turned it off (e.g. a second profile joined the phone): drop the local secret too. */
    fun syncWith(profiles: List<PhoneProfile>) {
        profiles.filter { !it.biometric && biometric.isOn(it.uid) }.forEach { biometric.forget(it.uid) }
    }

    private fun refused(e: Throwable) = Result.Refused((e as? PinException)?.failure ?: PinFailure.Unknown(e.message))

    private fun Outcome<*>.toResult(): Result = when (this) {
        is Outcome.Done -> Result.Done
        Outcome.Cancelled -> Result.Cancelled
        Outcome.Changed -> Result.Changed
        is Outcome.Failed -> Result.Refused(PinFailure.Unknown(message))
    }
}
