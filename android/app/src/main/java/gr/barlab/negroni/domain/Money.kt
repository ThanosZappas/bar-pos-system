package gr.barlab.negroni.domain

/** Money is always integer euro cents. Formatting follows the bar's menu: "10 €", "8,50 €". */
object Money {
    fun format(cents: Long): String {
        val sign = if (cents < 0) "-" else ""
        val abs = kotlin.math.abs(cents)
        val euros = abs / 100
        val rest = abs % 100
        return if (rest == 0L) "$sign$euros €" else "$sign$euros,${rest.toString().padStart(2, '0')} €"
    }
}
