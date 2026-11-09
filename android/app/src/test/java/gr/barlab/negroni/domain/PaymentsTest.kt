package gr.barlab.negroni.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// Same cases as web/src/domain/payments.test.ts.
class PaymentsTest {
    private fun pay(id: String, amount: Long, reversalOf: String? = null) =
        Payment(id, "t", "1", "s", amount, PaymentMethod.Cash, reversalOf, if (reversalOf != null) "x" else null, 0, "S")
    private fun line(id: String, item: String, name: String, price: Long, qty: Int, cancelled: Boolean = false) =
        OrderLine(id, item, name, price, qty, "", cancelled)
    private fun round(status: RoundStatus, vararg lines: OrderLine) = Round("r", "t", "1", "s", status, lines.toList(), "", 0, "S")

    @Test fun sumsIncludingReversals() =
        assertEquals(2000L, Payments.paidCents(listOf(pay("a", 2000), pay("b", 500), pay(Payments.reversalId("b"), -500, "b"))))

    @Test fun knowsReversedPayments() {
        val all = listOf(pay("a", 2000), pay(Payments.reversalId("a"), -2000, "a"))
        assertTrue(Payments.isReversed(all[0], all))
        assertFalse(Payments.isReversed(pay("b", 1), all))
    }

    @Test fun refusesNonPositiveAndOverpayment() {
        assertEquals(Payments.AmountProblem.NotPositive, Payments.checkAmount(0, 1000))
        assertEquals(Payments.AmountProblem.MoreThanDue, Payments.checkAmount(1001, 1000))
        assertNull(Payments.checkAmount(1000, 1000))
    }

    @Test fun drivesServedToPartiallyPaidToPaid() {
        val rounds = listOf(round(RoundStatus.Served, line("a", "n", "Classic Negroni", 1000, 2)))
        assertEquals(TableStatus.PartiallyPaid, TableState.derive(rounds, Payments.paidCents(listOf(pay("a", 500)))).status)
        assertEquals(TableStatus.Paid, TableState.derive(rounds, Payments.paidCents(listOf(pay("a", 500), pay("b", 1500)))).status)
        assertEquals(TableStatus.Served, TableState.derive(rounds, Payments.paidCents(listOf(pay("a", 2000), pay(Payments.reversalId("a"), -2000, "a")))).status)
    }

    @Test fun parsesTypedAmounts() {
        assertEquals(1000L, Payments.parseAmount("10"))
        assertEquals(850L, Payments.parseAmount("8,5"))
        assertEquals(850L, Payments.parseAmount("8.50 €"))
        assertNull(Payments.parseAmount("8,555"))
        assertNull(Payments.parseAmount("-3"))
    }

    @Test fun summaryMergesItemsAndSkipsCancelled() {
        val rounds = listOf(
            round(RoundStatus.Served, line("a", "n", "Classic Negroni", 1000, 2), line("b", "z", "Zombie", 1200, 1, cancelled = true)),
            round(RoundStatus.Served, line("c", "n", "Classic Negroni", 1000, 1), line("d", "c", "Coca Cola", 350, 2)),
            round(RoundStatus.Cancelled, line("e", "n", "Classic Negroni", 1000, 5)),
        )
        assertEquals(
            listOf(SummaryLine("Classic Negroni", 1000, 3, 3000), SummaryLine("Coca Cola", 350, 2, 700)),
            summaryLines(rounds),
        )
    }
}
