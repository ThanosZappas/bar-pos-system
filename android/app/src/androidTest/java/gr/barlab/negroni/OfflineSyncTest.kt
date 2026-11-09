package gr.barlab.negroni

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.android.gms.tasks.Tasks
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Source
import gr.barlab.negroni.auth.Role
import gr.barlab.negroni.auth.StaffUser
import gr.barlab.negroni.catalog.DiningTable
import gr.barlab.negroni.data.FirebaseSetup
import gr.barlab.negroni.domain.OrderDraft
import gr.barlab.negroni.domain.PaymentMethod
import gr.barlab.negroni.orders.OrdersRepository
import gr.barlab.negroni.pos.NoOpPosGateway
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Runs on the phone against the laptop's Firestore and Auth emulators (reached over USB with
 * `adb reverse`; see scripts/verify-offline-on-phone.sh). Uses the real OrdersRepository.
 *
 * Scenario: go offline, take 3 orders and 2 payments, kill Firestore while they are still queued
 * (as when Android kills the app), start again with the network back, and check that the server
 * has every write exactly once.
 */
@RunWith(AndroidJUnit4::class)
class OfflineSyncTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private lateinit var app: FirebaseApp
    private lateinit var auth: FirebaseAuth

    private fun <T> await(task: com.google.android.gms.tasks.Task<T>): T = Tasks.await(task, 30, TimeUnit.SECONDS)

    /** A Firestore instance like the app's: on-disk cache, pointed at the emulator. */
    private fun firestore(): FirebaseFirestore = FirebaseFirestore.getInstance(app).apply {
        useEmulator(HOST, 8080)
        firestoreSettings = FirebaseSetup.OFFLINE_SETTINGS
    }

    @Before
    fun setUp() {
        app = FirebaseApp.getApps(context).firstOrNull { it.name == APP_NAME }
            ?: FirebaseApp.initializeApp(
                context,
                FirebaseOptions.Builder().setProjectId("demo-negroni").setApplicationId("1:000000000000:android:0000000000000000").setApiKey("emulator-only").build(),
                APP_NAME,
            )
        auth = FirebaseAuth.getInstance(app)
        if (!authConnected) {
            auth.useEmulator(HOST, 9099)
            authConnected = true
        }
        // Seeded by the script: user1 / user1user1 (emulator only).
        await(auth.signInWithEmailAndPassword("user1@users.negronibarlab.invalid", "user1user1"))
    }

    @Test
    fun ordersAndPaymentsQueuedOfflineSurviveAKillAndArriveExactlyOnce() {
        var db = firestore()
        await(db.clearPersistence())

        val tableDoc = await(db.document("tables/table-01").get(Source.SERVER))
        val table = DiningTable(tableDoc.id, tableDoc.getString("name")!!, tableDoc.getLong("order") ?: 0, tableDoc.getString("currentSessionId")!!)
        val roundsBefore = serverCount(db, "rounds", table.currentSessionId)
        val paymentsBefore = serverCount(db, "payments", table.currentSessionId)

        val user = StaffUser(auth.currentUser!!.uid, "user1", "Server 1", Role.Server, mustChangePassword = false)
        val draft = OrderDraft().add("negroni-c01-i01", "Classic Negroni", 1000, 2, "").withNote("offline test")

        // 1. Offline: the writes are accepted locally at once.
        await(db.disableNetwork())
        val orders = OrdersRepository(db, NoOpPosGateway)
        val roundIds = List(3) { orders.submit(table, user, draft) }
        orders.addPayment(table, 500, PaymentMethod.Cash, user)
        orders.addPayment(table, 700, PaymentMethod.Card, user)

        val local = await(db.collection("rounds").whereEqualTo("sessionId", table.currentSessionId).get(Source.CACHE))
        assertEquals(3, local.documents.count { it.id in roundIds && it.metadata.hasPendingWrites() })

        // 2. "Kill the app": shut Firestore down with the writes still queued on disk.
        await(db.terminate())

        // 3. Start again with the network on: the queue is read back from disk and sent.
        db = firestore()
        waitUntil { serverCount(db, "rounds", table.currentSessionId) >= roundsBefore + 3 && serverCount(db, "payments", table.currentSessionId) >= paymentsBefore + 2 }

        // 4. Exactly once: no loss, no duplicates.
        assertEquals(roundsBefore + 3, serverCount(db, "rounds", table.currentSessionId))
        assertEquals(paymentsBefore + 2, serverCount(db, "payments", table.currentSessionId))
        for (id in roundIds) {
            val events = await(db.collection("rounds").document(id).collection("events").get(Source.SERVER))
            assertEquals("round $id should have exactly its created event", listOf("created"), events.documents.map { it.getString("type") })
        }
        await(db.terminate())
    }

    private fun serverCount(db: FirebaseFirestore, collection: String, sessionId: String): Int =
        await(db.collection(collection).whereEqualTo("sessionId", sessionId).get(Source.SERVER)).size()

    private fun waitUntil(timeoutMs: Long = 30_000, condition: () -> Boolean) {
        val end = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < end) {
            if (runCatching(condition).getOrDefault(false)) return
            Thread.sleep(500)
        }
        throw AssertionError("Queued writes did not reach the server within ${timeoutMs / 1000} s")
    }

    companion object {
        /** The phone's own localhost, forwarded to the laptop by `adb reverse`. */
        private const val HOST = "127.0.0.1"
        private const val APP_NAME = "offline-test"
        private var authConnected = false
    }
}
