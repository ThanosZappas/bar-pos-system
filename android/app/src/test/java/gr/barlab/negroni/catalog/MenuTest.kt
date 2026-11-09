package gr.barlab.negroni.catalog

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MenuTest {
    private val sections = listOf(
        SectionDoc("spirits", "Spirits", "Pour 60ml", order = 1, hidden = false, archived = false),
        SectionDoc("negroni", "Negroni", "", order = 0, hidden = false, archived = false),
        SectionDoc("old", "Old", "", order = 2, hidden = false, archived = true),
        SectionDoc("secret", "Secret", "", order = 3, hidden = true, archived = false),
    )
    private val categories = listOf(
        CategoryDoc("n-classic", "negroni", "Classic", order = 0, hidden = false, archived = false),
        CategoryDoc("n-var", "negroni", "Variations", order = 1, hidden = false, archived = false),
        CategoryDoc("s-gin", "spirits", "Gin", order = 0, hidden = true, archived = false),
        CategoryDoc("s-rum", "spirits", "Rum", order = 1, hidden = false, archived = false),
        CategoryDoc("x", "secret", "Hidden by section", order = 0, hidden = false, archived = false),
    )
    private fun item(id: String, cat: String, name: String, order: Long, desc: String = "", hidden: Boolean = false, archived: Boolean = false, tags: List<String> = emptyList()) =
        ItemDoc(id, cat, name, desc, 1000, tags, order, hidden, archived)

    private val items = listOf(
        item("holy", "n-var", "Holy Groni", 1, "Τσίπουρο Αγιονερίου · Pamplemousse Vermouth"),
        item("red", "n-var", "Red Nose Negroni", 0, "Gin · Bitter"),
        item("nogroni", "n-var", "No-Groni", 2, tags = listOf("Non Alcoholic")),
        item("classic", "n-classic", "Classic Negroni", 0, "Gin · Campari"),
        item("gone", "n-classic", "Removed", 1, archived = true),
        item("off", "n-classic", "Off today", 2, hidden = true),
        item("gin", "s-gin", "Gin", 0),
        item("rum", "s-rum", "Rum", 0, "Havana 3y · Bacardi"),
        item("x1", "x", "Invisible", 0),
    )

    private val menu = Menu.build(sections, categories, items)

    @Test fun ordersSectionsCategoriesAndItems() {
        assertEquals(listOf("Negroni", "Spirits"), menu.sections.map { it.name })
        assertEquals(listOf("Classic", "Variations"), menu.sections[0].categories.map { it.name })
        assertEquals(listOf("Red Nose Negroni", "Holy Groni", "No-Groni"), menu.sections[0].categories[1].items.map { it.name })
    }

    @Test fun dropsHiddenAndArchivedAtEveryLevel() {
        val names = menu.sections.flatMap { s -> s.categories.flatMap { c -> c.items.map { it.name } } }
        assertEquals(listOf("Classic Negroni", "Red Nose Negroni", "Holy Groni", "No-Groni", "Rum"), names)
    }

    @Test fun searchIgnoresCaseAndGreekAccents() {
        assertEquals(listOf("Holy Groni"), menu.search("τσιπουρο").allItemNames())
        assertEquals(listOf("Red Nose Negroni", "Classic Negroni").sorted(), menu.search("GIN").allItemNames().sorted())
    }

    @Test fun searchMatchesTagsAndKeepsStructure() {
        val found = menu.search("non alcoholic")
        assertEquals(listOf("No-Groni"), found.allItemNames())
        assertEquals("Variations", found.sections.single().categories.single().name)
    }

    @Test fun blankSearchReturnsEverything() = assertEquals(menu, menu.search("  "))

    @Test fun noMatchIsEmpty() = assertTrue(menu.search("tequila").isEmpty)

    private fun Menu.allItemNames() = sections.flatMap { s -> s.categories.flatMap { c -> c.items.map { it.name } } }
}
