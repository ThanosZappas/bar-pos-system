package gr.barlab.negroni.domain

import java.util.UUID

/** One line of a round. Price and name are copied from the menu at order time (menu edits never change past orders). */
data class OrderLine(
    val lineId: String,
    val itemId: String,
    val name: String,
    val priceCents: Long,
    val qty: Int,
    val note: String,
    val cancelled: Boolean = false,
) {
    val totalCents: Long get() = if (cancelled) 0 else priceCents * qty

    companion object {
        const val MAX_QTY = 99
        fun newId(): String = UUID.randomUUID().toString()
    }
}

enum class RoundStatus(val wire: String) {
    Preparing("preparing"),
    Served("served"),
    Cancelled("cancelled");

    companion object {
        fun fromWire(value: String?) = entries.firstOrNull { it.wire == value } ?: Preparing
    }
}

/** A submitted order ("round") for a table. Times are epoch milliseconds. */
data class Round(
    val id: String,
    val tableId: String,
    val tableName: String,
    val sessionId: String,
    val status: RoundStatus,
    val lines: List<OrderLine>,
    val note: String,
    val createdAtMs: Long,
    val createdByName: String,
    val openedAtMs: Long? = null,
    val servedAtMs: Long? = null,
    val servedByName: String? = null,
    val editCount: Int = 0,
    val editSeen: Boolean = true,
    val lastEditByName: String? = null,
    val cancelledByName: String? = null,
    /** Written on this phone but not yet confirmed by the server (offline or in flight). */
    val pendingSync: Boolean = false,
) {
    val totalCents: Long get() = if (status == RoundStatus.Cancelled) 0 else lines.sumOf { it.totalCents }
    val activeLines: List<OrderLine> get() = lines.filter { !it.cancelled }
    val isEditable: Boolean get() = status == RoundStatus.Preparing

    /** Not yet looked at by the barman. */
    val isNew: Boolean get() = openedAtMs == null && status == RoundStatus.Preparing

    /** Edited or cancelled since the barman last looked. */
    val isChanged: Boolean get() = !editSeen

    /**
     * Sent offline and synced after its table was closed (or the table was removed): the round
     * belongs to a session that is no longer the table's current one. Accepted and flagged.
     */
    fun isLate(currentSessionByTable: Map<String, String>): Boolean = currentSessionByTable[tableId] != sessionId

    /** On the bar's to-do list: still Preparing, or cancelled and not yet acknowledged. */
    val isOnBoard: Boolean get() = status == RoundStatus.Preparing || (status == RoundStatus.Cancelled && !editSeen)
}

/** "45 s", "12 min", "1 h 05": how long a round has been waiting. Same as the dashboard. */
fun elapsed(fromMs: Long, nowMs: Long): String {
    val s = ((nowMs - fromMs) / 1000).coerceAtLeast(0)
    if (s < 60) return "$s s"
    val m = s / 60
    if (m < 60) return "$m min"
    return "${m / 60} h ${(m % 60).toString().padStart(2, '0')}"
}

/**
 * The cart while a server builds a round. Adding the same item with the same note merges
 * into one line; different notes stay separate lines.
 */
data class OrderDraft(val lines: List<OrderLine> = emptyList(), val note: String = "") {
    val itemCount: Int get() = lines.sumOf { it.qty }
    val totalCents: Long get() = lines.sumOf { it.totalCents }
    val isEmpty: Boolean get() = lines.isEmpty()

    fun add(itemId: String, name: String, priceCents: Long, qty: Int, note: String, newLineId: () -> String = OrderLine::newId): OrderDraft {
        require(qty >= 1)
        val cleanNote = note.trim()
        val existing = lines.indexOfFirst { it.itemId == itemId && it.note == cleanNote }
        return if (existing >= 0) {
            val line = lines[existing]
            copy(lines = lines.toMutableList().apply { set(existing, line.copy(qty = (line.qty + qty).coerceAtMost(OrderLine.MAX_QTY))) })
        } else {
            copy(lines = lines + OrderLine(newLineId(), itemId, name, priceCents, qty.coerceAtMost(OrderLine.MAX_QTY), cleanNote))
        }
    }

    /** qty 0 removes the line. */
    fun setQty(lineId: String, qty: Int): OrderDraft =
        if (qty <= 0) copy(lines = lines.filterNot { it.lineId == lineId })
        else copy(lines = lines.map { if (it.lineId == lineId) it.copy(qty = qty.coerceAtMost(OrderLine.MAX_QTY)) else it })

    fun setLineNote(lineId: String, note: String): OrderDraft = copy(lines = lines.map { if (it.lineId == lineId) it.copy(note = note) else it })

    fun withNote(note: String): OrderDraft = copy(note = note)
}

/** One change made to a Preparing round, kept in the round's event log and shown to the barman. */
data class LineChange(
    val lineId: String,
    val name: String,
    val qtyFrom: Int,
    val qtyTo: Int,
    val noteFrom: String,
    val noteTo: String,
    val cancelled: Boolean,
)

object RoundEdits {
    /** Differences between the saved lines and the edited ones (same line ids; lines are never added in an edit). */
    fun diff(before: List<OrderLine>, after: List<OrderLine>): List<LineChange> {
        val afterById = after.associateBy { it.lineId }
        return before.mapNotNull { old ->
            val new = afterById[old.lineId] ?: return@mapNotNull null
            val cancelledNow = new.cancelled && !old.cancelled
            if (old.qty == new.qty && old.note == new.note && !cancelledNow) null
            else LineChange(old.lineId, old.name, old.qty, new.qty, old.note, new.note, cancelledNow)
        }
    }
}
