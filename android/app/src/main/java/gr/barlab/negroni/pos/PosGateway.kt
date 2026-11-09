package gr.barlab.negroni.pos

import gr.barlab.negroni.domain.Payment
import gr.barlab.negroni.domain.Round
import gr.barlab.negroni.domain.SummaryLine
import java.io.File
import java.time.Instant

/**
 * Seam for a future POS / fiscal integration (design only, no real POS yet). The app calls it
 * when a round is sent and when a table is closed. Mirrors web/src/domain/pos.ts.
 */
interface PosGateway {
    fun sendOrder(round: Round)
    fun sendReceipt(receipt: Receipt)
}

data class Receipt(
    val tableId: String,
    val tableName: String,
    val sessionId: String,
    val lines: List<SummaryLine>,
    val totalCents: Long,
    val payments: List<Payment>,
    val closedAtMs: Long,
    val closedByName: String,
)

/** Default: does nothing. */
object NoOpPosGateway : PosGateway {
    override fun sendOrder(round: Round) = Unit
    override fun sendReceipt(receipt: Receipt) = Unit
}

/** Writes one JSON file per order/receipt into [dir] (app-private storage), for inspection or a later import. */
class JsonExportPosGateway(private val dir: File) : PosGateway {
    override fun sendOrder(round: Round) = write("order-${round.id}.json", PosJson.order(round))
    override fun sendReceipt(receipt: Receipt) = write("receipt-${receipt.sessionId}.json", PosJson.receipt(receipt))

    private fun write(name: String, json: String) {
        dir.mkdirs()
        File(dir, name).writeText(json)
    }
}

/**
 * Stable JSON for an external system: integer cents, ISO-8601 times, fiscal=false. Written by
 * hand because Android's org.json is unavailable in JVM unit tests and a JSON library would be
 * a dependency for two small documents.
 */
object PosJson {
    fun order(r: Round): String = obj(
        "kind" to str("order"),
        "id" to str(r.id),
        "table" to obj("id" to str(r.tableId), "name" to str(r.tableName)),
        "sessionId" to str(r.sessionId),
        "status" to str(r.status.wire),
        "currency" to str("EUR"),
        "lines" to arr(r.lines.map { l ->
            obj(
                "itemId" to str(l.itemId), "name" to str(l.name), "priceCents" to l.priceCents.toString(),
                "qty" to l.qty.toString(), "note" to str(l.note), "cancelled" to l.cancelled.toString(),
            )
        }),
        "note" to str(r.note),
        "totalCents" to r.totalCents.toString(),
        "createdAt" to str(iso(r.createdAtMs)),
        "createdBy" to str(r.createdByName),
    )

    fun receipt(r: Receipt): String = obj(
        "kind" to str("receipt"),
        "fiscal" to "false",
        "table" to obj("id" to str(r.tableId), "name" to str(r.tableName)),
        "sessionId" to str(r.sessionId),
        "currency" to str("EUR"),
        "lines" to arr(r.lines.map { l ->
            obj("name" to str(l.name), "priceCents" to l.priceCents.toString(), "qty" to l.qty.toString(), "totalCents" to l.totalCents.toString())
        }),
        "totalCents" to r.totalCents.toString(),
        "payments" to arr(r.payments.map { p ->
            obj(
                "id" to str(p.id), "amountCents" to p.amountCents.toString(), "method" to str(p.method.wire),
                "reversalOf" to (p.reversalOf?.let(::str) ?: "null"), "createdAt" to str(iso(p.createdAtMs)), "createdBy" to str(p.createdByName),
            )
        }),
        "closedAt" to str(iso(r.closedAtMs)),
        "closedBy" to str(r.closedByName),
    )

    private fun iso(ms: Long) = Instant.ofEpochMilli(ms).toString()
    private fun obj(vararg fields: Pair<String, String>) = fields.joinToString(",", "{", "}") { (k, v) -> "${str(k)}:$v" }
    private fun arr(items: List<String>) = items.joinToString(",", "[", "]")

    fun str(s: String): String = buildString {
        append('"')
        s.forEach { c ->
            when {
                c == '"' -> append("\\\"")
                c == '\\' -> append("\\\\")
                c == '\n' -> append("\\n")
                c == '\r' -> append("\\r")
                c == '\t' -> append("\\t")
                c < ' ' -> append("\\u%04x".format(c.code))
                else -> append(c)
            }
        }
        append('"')
    }
}
