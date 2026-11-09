package gr.barlab.negroni.catalog

import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.snapshots
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map

/**
 * Live menu and tables. Firestore listeners push every admin change to all phones, and the
 * local cache keeps both available offline. Collections are small, so archived rows are filtered here.
 */
class CatalogRepository(private val db: FirebaseFirestore) {

    val menu: Flow<Menu> = combine(
        docs("menuSections") { it.toSection() },
        docs("menuCategories") { it.toCategory() },
        docs("menuItems") { it.toItem() },
    ) { s, c, i -> Menu.build(s, c, i) }

    val tables: Flow<List<DiningTable>> = db.collection("tables").snapshots().map { snap ->
        snap.documents.filter { it.getBoolean("archived") != true }.map { it.toTable() }.sortedBy { it.order }
    }.catch { emit(emptyList()) }

    private fun <T> docs(collection: String, map: (DocumentSnapshot) -> T): Flow<List<T>> =
        db.collection(collection).snapshots().map { snap -> snap.documents.map(map) }
            // Access revoked mid-session (deactivated user): stop quietly; the session screen takes over.
            .catch { emit(emptyList()) }

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
