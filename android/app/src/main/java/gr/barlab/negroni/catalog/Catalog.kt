package gr.barlab.negroni.catalog

import java.text.Normalizer

/** Raw documents as stored in Firestore (menuSections, menuCategories, menuItems, tables). */
data class SectionDoc(val id: String, val name: String, val note: String, val order: Long, val hidden: Boolean, val archived: Boolean)
data class CategoryDoc(val id: String, val sectionId: String, val name: String, val order: Long, val hidden: Boolean, val archived: Boolean)
data class ItemDoc(
    val id: String,
    val categoryId: String,
    val name: String,
    val description: String,
    val priceCents: Long,
    val tags: List<String>,
    val order: Long,
    val hidden: Boolean,
    val archived: Boolean,
)
data class ReceiptHeader(val barName: String, val address: String, val phone: String, val footer: String) {
    companion object {
        val DEFAULT = ReceiptHeader("Negroni Bar Lab", "", "", "")
    }
}

data class DiningTable(val id: String, val name: String, val order: Long, val currentSessionId: String)

/** The orderable menu: only visible entries, sorted the way the admin arranged them. */
data class Menu(val sections: List<Section>) {
    data class Section(val id: String, val name: String, val note: String, val categories: List<Category>)
    data class Category(val id: String, val name: String, val items: List<Item>)
    data class Item(val id: String, val name: String, val description: String, val priceCents: Long, val tags: List<String>)

    val isEmpty get() = sections.isEmpty()

    /**
     * Case- and accent-insensitive search over name, description and tags ("τσιπουρο" finds
     * "Τσίπουρο"). Keeps the section/category structure; drops empty branches.
     */
    fun search(query: String): Menu {
        val q = fold(query.trim())
        if (q.isEmpty()) return this
        return Menu(
            sections.mapNotNull { s ->
                val cats = s.categories.mapNotNull { c ->
                    val items = c.items.filter { i -> listOf(i.name, i.description, *i.tags.toTypedArray()).any { fold(it).contains(q) } }
                    if (items.isEmpty()) null else c.copy(items = items)
                }
                if (cats.isEmpty()) null else s.copy(categories = cats)
            },
        )
    }

    companion object {
        private val MARKS = Regex("\\p{Mn}+")
        fun fold(s: String): String = MARKS.replace(Normalizer.normalize(s.lowercase(), Normalizer.Form.NFD), "")

        /** Hidden or archived entries are not orderable; hiding a section or category hides everything below it. */
        fun build(sections: List<SectionDoc>, categories: List<CategoryDoc>, items: List<ItemDoc>): Menu {
            val itemsByCategory = items.filter { !it.hidden && !it.archived }.groupBy { it.categoryId }
            val categoriesBySection = categories.filter { !it.hidden && !it.archived }.groupBy { it.sectionId }
            return Menu(
                sections.filter { !it.hidden && !it.archived }.sortedBy { it.order }.mapNotNull { s ->
                    val cats = categoriesBySection[s.id].orEmpty().sortedBy { it.order }.mapNotNull { c ->
                        val its = itemsByCategory[c.id].orEmpty().sortedBy { it.order }
                            .map { Item(it.id, it.name, it.description, it.priceCents, it.tags) }
                        if (its.isEmpty()) null else Category(c.id, c.name, its)
                    }
                    if (cats.isEmpty()) null else Section(s.id, s.name, s.note, cats)
                },
            )
        }
    }
}
