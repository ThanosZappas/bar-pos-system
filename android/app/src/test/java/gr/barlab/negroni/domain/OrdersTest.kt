package gr.barlab.negroni.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OrderDraftTest {
    private var n = 0
    private fun id() = "l${++n}"
    private fun draft() = OrderDraft()
        .add("negroni", "Classic Negroni", 1000, 2, "", ::id)
        .add("zombie", "Zombie", 1200, 1, "no ice", ::id)

    @Test fun totalsAndCounts() {
        val d = draft()
        assertEquals(3, d.itemCount)
        assertEquals(3200, d.totalCents)
    }

    @Test fun sameItemSameNoteMerges() {
        val d = draft().add("negroni", "Classic Negroni", 1000, 1, "  ", ::id)
        assertEquals(2, d.lines.size)
        assertEquals(3, d.lines.first { it.itemId == "negroni" }.qty)
    }

    @Test fun differentNoteIsSeparateLine() {
        val d = draft().add("negroni", "Classic Negroni", 1000, 1, "orange peel", ::id)
        assertEquals(3, d.lines.size)
    }

    @Test fun qtyZeroRemovesAndQtyIsCapped() {
        val d = draft()
        assertEquals(1, d.setQty("l1", 0).lines.size)
        assertEquals(OrderLine.MAX_QTY, d.setQty("l1", 500).lines.first().qty)
    }
}

class RoundEditsTest {
    private val before = listOf(
        OrderLine("a", "negroni", "Classic Negroni", 1000, 2, ""),
        OrderLine("b", "zombie", "Zombie", 1200, 1, ""),
        OrderLine("c", "mojito", "Classic Mojito", 1000, 1, "less sugar"),
    )

    @Test fun reportsQtyNoteAndCancelChangesOnly() {
        val after = listOf(before[0].copy(qty = 3), before[1].copy(cancelled = true), before[2])
        val changes = RoundEdits.diff(before, after)
        assertEquals(listOf("a", "b"), changes.map { it.lineId })
        assertEquals(2 to 3, changes[0].qtyFrom to changes[0].qtyTo)
        assertTrue(changes[1].cancelled)
    }

    @Test fun noteChangeIsAChange() {
        val changes = RoundEdits.diff(before, before.map { if (it.lineId == "c") it.copy(note = "") else it })
        assertEquals(listOf(LineChange("c", "Classic Mojito", 1, 1, "less sugar", "", false)), changes)
    }

    @Test fun noChangesIsEmpty() = assertTrue(RoundEdits.diff(before, before).isEmpty())
}

class TableStatusTest {
    private fun round(status: RoundStatus, vararg lines: OrderLine) =
        Round("r", "t", "1", "s", status, lines.toList(), "", 0, "Server 1")
    private val two = OrderLine("a", "negroni", "Classic Negroni", 1000, 2, "")
    private val cancelled = OrderLine("b", "zombie", "Zombie", 1200, 1, "", cancelled = true)

    @Test fun freeWithoutRounds() = assertEquals(TableStatus.Free, TableState.derive(emptyList()).status)

    @Test fun cancelledRoundsDoNotCount() {
        val s = TableState.derive(listOf(round(RoundStatus.Cancelled, two), round(RoundStatus.Preparing, cancelled)))
        assertEquals(TableStatus.Free, s.status)
        assertEquals(0, s.totalCents)
    }

    @Test fun preparingWinsOverServed() {
        val s = TableState.derive(listOf(round(RoundStatus.Served, two), round(RoundStatus.Preparing, two)))
        assertEquals(TableStatus.Preparing, s.status)
        assertEquals(4000, s.totalCents)
    }

    @Test fun servedThenPaymentStates() {
        val rounds = listOf(round(RoundStatus.Served, two, cancelled))
        assertEquals(TableStatus.Served, TableState.derive(rounds).status)
        assertEquals(TableStatus.PartiallyPaid, TableState.derive(rounds, paidCents = 500).status)
        assertEquals(TableStatus.Paid, TableState.derive(rounds, paidCents = 2000).status)
        assertEquals(1500, TableState.derive(rounds, paidCents = 500).dueCents)
    }
}
