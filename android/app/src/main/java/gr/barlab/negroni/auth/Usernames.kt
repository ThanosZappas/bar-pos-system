package gr.barlab.negroni.auth

/**
 * Staff log in with a username; Firebase Auth needs an email. Usernames map to fake
 * addresses on the reserved `.invalid` TLD. Same rules as worker/src/usernames.ts.
 */
object Usernames {
    const val INTERNAL_EMAIL_DOMAIN = "users.negronibarlab.invalid"
    private val PATTERN = Regex("^[a-z0-9._-]{3,32}$")

    fun normalize(raw: String): String = raw.trim().lowercase()

    fun isValid(username: String): Boolean = PATTERN.matches(username)

    /** Null when the username cannot exist, so the caller can fail fast without a network call. */
    fun toEmail(raw: String): String? = normalize(raw).takeIf(::isValid)?.let { "$it@$INTERNAL_EMAIL_DOMAIN" }
}
