package gr.barlab.negroni.domain

// Mirrors web/src/domain/payments.ts. Same test cases on both sides.

enum class PaymentMethod(val wire: String) {
    Cash("cash"),
    Card("card");

    companion object {
        fun fromWire(value: String?) = if (value == Card.wire) Card else Cash
    }
}

/** Immutable once written. A reversal has a negative amount and points at the original. */
data class Payment(
    val id: String,
    val tableId: String,
    val tableName: String,
    val sessionId: String,
    val amountCents: Long,
    val method: PaymentMethod,
    val reversalOf: String?,
    val reason: String?,
    val createdAtMs: Long,
    val createdByName: String,
    val pendingSync: Boolean = false,
)

object Payments {
    fun paidCents(payments: List<Payment>): Long = payments.sumOf { it.amountCents }

    /** Derived from the original, so the rules allow only one reversal per payment. */
    fun reversalId(paymentId: String) = "reversal-$paymentId"

    fun isReversed(p: Payment, all: List<Payment>) = all.any { it.reversalOf == p.id }

    enum class AmountProblem { NotPositive, MoreThanDue }

    /** New payments must be positive and may not exceed what is still due (no overpayment, no tips). */
    fun checkAmount(amountCents: Long, dueCents: Long): AmountProblem? = when {
        amountCents <= 0 -> AmountProblem.NotPositive
        amountCents > dueCents -> AmountProblem.MoreThanDue
        else -> null
    }

    /** Reads what someone types: "10", "8,5", "8.50", "12 €". Null if it is not an amount. */
    fun parseAmount(raw: String): Long? {
        val m = Regex("^(\\d{1,5})(?:[.,](\\d{1,2}))?$").matchEntire(raw.replace("€", "").trim()) ?: return null
        return m.groupValues[1].toLong() * 100 + m.groupValues[2].padEnd(2, '0').toLong()
    }
}

data class SummaryLine(val name: String, val priceCents: Long, val qty: Int, val totalCents: Long)

/**
 * Lines of the non-fiscal summary: active lines of non-cancelled rounds, merged by item, name
 * and price, in order of first appearance.
 */
fun summaryLines(rounds: List<Round>): List<SummaryLine> {
    val merged = LinkedHashMap<String, SummaryLine>()
    rounds.filter { it.status != RoundStatus.Cancelled }.flatMap { it.activeLines }.forEach { l ->
        val key = "${l.itemId}|${l.name}|${l.priceCents}"
        val prev = merged[key] ?: SummaryLine(l.name, l.priceCents, 0, 0)
        merged[key] = prev.copy(qty = prev.qty + l.qty, totalCents = prev.totalCents + l.qty * l.priceCents)
    }
    return merged.values.toList()
}

/**
 * Start of the bar's business day (06:00 local; a night runs past midnight), as epoch ms. The
 * phone's and the dashboard's "today" lists use it, like the dashboard analytics.
 */
fun businessDayStart(nowMs: Long, zone: java.time.ZoneId = java.time.ZoneId.systemDefault()): Long {
    val t = java.time.Instant.ofEpochMilli(nowMs).atZone(zone)
    var start = t.toLocalDate().atTime(BUSINESS_DAY_START_HOUR, 0).atZone(zone)
    if (t.isBefore(start)) start = start.minusDays(1)
    return start.toInstant().toEpochMilli()
}

const val BUSINESS_DAY_START_HOUR = 6
