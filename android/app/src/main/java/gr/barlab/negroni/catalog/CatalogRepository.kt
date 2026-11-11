package gr.barlab.negroni.catalog

import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.snapshots
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.flow.Flow
import gr.barlab.negroni.data.keepAlive
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map

/**
 * Live menu and tables. Firestore listeners push every admin change to all phones, and the
 * local cache keeps both available offline. Collections are small, so archived rows are filtered here.
 */
class CatalogRepository(private val db: FirebaseFirestore, private val functions: FirebaseFunctions) {

    val menu: Flow<Menu> = combine(
        docs("menuSections") { it.toSection() },
        docs("menuCategories") { it.toCategory() },
        docs("menuItems") { it.toItem() },
    ) { s, c, i -> Menu.build(s, c, i) }

    val tables: Flow<List<DiningTable>> = db.collection("tables").snapshots().map { snap ->
        snap.documents.filter { it.getBoolean("archived") != true }.map { it.toTable() }.sortedBy { it.order }
    }.keepAlive()

    /** Header for the non-fiscal summary (settings/app, edited by the admin in the dashboard). */
    val receiptHeader: Flow<ReceiptHeader> = db.document("settings/app").snapshots().map { d ->
        ReceiptHeader(
            barName = d.getString("barName") ?: ReceiptHeader.DEFAULT.barName,
            address = d.getString("address").orEmpty(),
            phone = d.getString("phone").orEmpty(),
            footer = d.getString("receiptFooter").orEmpty(),
        )
    }.keepAlive()

    /**
     * Guests change table: the open bill moves to a free table. The server checks the target is
     * free and moves it atomically, so this needs a connection.
     */
    suspend fun moveTable(from: DiningTable, to: DiningTable): Result<Unit> = runCatching {
        functions.getHttpsCallable("moveTable").call(mapOf("fromTableId" to from.id, "toTableId" to to.id)).await()
        Unit
    }

    private fun <T> docs(collection: String, map: (DocumentSnapshot) -> T): Flow<List<T>> =
        db.collection(collection).snapshots().map { snap -> snap.documents.map(map) }
            // Access revoked mid-session (deactivated user): stop quietly; the session screen takes over.
            .keepAlive()

    private fun DocumentSnapshot.str(field: String) = getString(field).orEmpty()
    private fun DocumentSnapshot.num(field: String) = getLong(field) ?: 0L
    private fun DocumentSnapshot.flag(field: String) = getBoolean(field) == true

    private fun DocumentSnapshot.toSection() = SectionDoc(id, str("name"), str("note"), num("order"), flag("hidden"), flag("archived"))
    private fun DocumentSnapshot.toCategory() = CategoryDoc(id, str("sectionId"), str("name"), num("order"), flag("hidden"), flag("archived"))
    private fun DocumentSnapshot.toItem() = ItemDoc(
        id = id,
        categoryId = str("categoryId"),
        name = str("name"),
        description = str("description"),
        priceCents = num("priceCents"),
        tags = (get("tags") as? List<*>)?.filterIsInstance<String>().orEmpty(),
        order = num("order"),
        hidden = flag("hidden"),
        archived = flag("archived"),
    )
    private fun DocumentSnapshot.toTable() = DiningTable(id, str("name"), num("order"), str("currentSessionId"))
}
