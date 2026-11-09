package gr.barlab.negroni.domain

/** Derived, never stored: computed from the current session's rounds and payments. */
enum class TableStatus { Free, Preparing, Served, PartiallyPaid, Paid }

data class TableState(val status: TableStatus, val totalCents: Long, val paidCents: Long, val roundCount: Int) {
    val dueCents: Long get() = (totalCents - paidCents).coerceAtLeast(0)

    companion object {
        /**
         * Preparing wins over payment states (the bar still has work to do). Otherwise:
         * nothing paid → Served, part paid → Partially paid, all paid → Paid. A session with no
         * active rounds and no payments is Free.
         */
        fun derive(rounds: List<Round>, paidCents: Long = 0): TableState {
            val active = rounds.filter { it.status != RoundStatus.Cancelled && it.activeLines.isNotEmpty() }
            val total = active.sumOf { it.totalCents }
            val status = when {
                active.isEmpty() && paidCents == 0L -> TableStatus.Free
                active.any { it.status == RoundStatus.Preparing } -> TableStatus.Preparing
                paidCents <= 0L -> TableStatus.Served
                paidCents < total -> TableStatus.PartiallyPaid
                else -> TableStatus.Paid
            }
            return TableState(status, total, paidCents, active.size)
        }
    }
}
