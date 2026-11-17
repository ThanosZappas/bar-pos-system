package gr.barlab.negroni.auth

/**
 * A profile on this phone's sign-in grid. What the phone stores (see [ProfileListFormat]) is only
 * the id, name, icon and picture version: no username, token or PIN. The rest comes fresh from
 * the server each time the grid opens.
 */
data class PhoneProfile(
    val uid: String,
    val displayName: String,
    val icon: String,
    val photoVersion: Long? = null,
    val hasPin: Boolean = true,
    val lockedUntilMs: Long? = null,
    /** Fingerprint unlock is on for this profile on this phone (server side). */
    val biometric: Boolean = false,
)

/** One profile per line, fields separated by tabs; names are cleaned of tabs and line breaks. */
object ProfileListFormat {
    fun encode(profiles: List<PhoneProfile>): String = profiles.joinToString("\n") { p ->
        listOf(p.uid, clean(p.displayName), p.icon, p.photoVersion?.toString().orEmpty()).joinToString("\t")
    }

    fun decode(text: String?): List<PhoneProfile> = text.orEmpty().lines().mapNotNull { line ->
        val f = line.split('\t')
        if (f.size < 3 || f[0].isBlank()) null else PhoneProfile(uid = f[0], displayName = f[1], icon = f[2], photoVersion = f.getOrNull(3)?.toLongOrNull())
    }

    private fun clean(s: String) = s.replace(Regex("[\\t\\r\\n]"), " ")
}
