package gr.barlab.negroni.pos

import gr.barlab.negroni.domain.Payment
import gr.barlab.negroni.domain.PaymentMethod
import gr.barlab.negroni.domain.SummaryLine
import org.junit.Assert.assertEquals
import org.junit.Test

class PosJsonTest {
    @Test fun escapesStrings() = assertEquals("\"a\\\"b\\\\c\\nd\"", PosJson.str("a\"b\\c\nd"))

    @Test fun receiptIsNonFiscalJsonWithCentsAndIsoTimes() {
        val json = PosJson.receipt(
            Receipt(
                tableId = "t", tableName = "1", sessionId = "s",
                lines = listOf(SummaryLine("Classic Negroni", 1000, 2, 2000)),
                totalCents = 2000,
                payments = listOf(Payment("p", "t", "1", "s", 2000, PaymentMethod.Card, null, null, 0, "Server 1")),
                closedAtMs = 0, closedByName = "Admin",
            ),
        )
        assertEquals(
            """{"kind":"receipt","fiscal":false,"table":{"id":"t","name":"1"},"sessionId":"s","currency":"EUR",""" +
                """"lines":[{"name":"Classic Negroni","priceCents":1000,"qty":2,"totalCents":2000}],"totalCents":2000,""" +
                """"payments":[{"id":"p","amountCents":2000,"method":"card","reversalOf":null,"createdAt":"1970-01-01T00:00:00Z","createdBy":"Server 1"}],""" +
                """"closedAt":"1970-01-01T00:00:00Z","closedBy":"Admin"}""",
            json,
        )
    }
}
