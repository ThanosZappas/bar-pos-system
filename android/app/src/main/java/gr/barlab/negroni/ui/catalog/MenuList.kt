package gr.barlab.negroni.ui.catalog

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import gr.barlab.negroni.R
import gr.barlab.negroni.catalog.Menu
import gr.barlab.negroni.domain.Money
import gr.barlab.negroni.ui.theme.BarLabColors
import gr.barlab.negroni.ui.theme.Spacing
import kotlinx.coroutines.launch

/**
 * Browsable menu: search box, section tabs that jump to their section, category headers and items.
 * [onItemClick] is null for read-only browsing; the order flow passes a handler.
 */
@Composable
fun MenuList(menu: Menu, modifier: Modifier = Modifier, onItemClick: ((Menu.Item) -> Unit)? = null) {
    var query by rememberSaveable { mutableStateOf("") }
    val shown = remember(menu, query) { menu.search(query) }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    // Index of each section's first row in the flat list, for the tabs.
    val rows = remember(shown) { flatten(shown) }
    val sectionStarts = remember(rows) { rows.withIndex().filter { it.value is Row.SectionHeader }.map { it.index } }
    // derivedStateOf: recompose only when the visible section changes, not on every scroll frame.
    val currentSection by remember(sectionStarts) {
        derivedStateOf { sectionStarts.indexOfLast { it <= listState.firstVisibleItemIndex }.coerceAtLeast(0) }
    }

    Column(modifier.fillMaxSize()) {
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = { Text(stringResource(R.string.menu_search)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            trailingIcon = { if (query.isNotEmpty()) TextButton(onClick = { query = "" }) { Text(stringResource(R.string.menu_search_clear)) } },
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.l, vertical = Spacing.s),
        )
        if (shown.sections.size > 1) {
            PrimaryScrollableTabRow(selectedTabIndex = currentSection, edgePadding = Spacing.l) {
                shown.sections.forEachIndexed { i, s ->
                    Tab(
                        selected = i == currentSection,
                        onClick = { scope.launch { listState.animateScrollToItem(sectionStarts[i]) } },
                        text = { Text(s.name.uppercase(), style = MaterialTheme.typography.labelLarge) },
                    )
                }
            }
        }
        when {
            menu.isEmpty -> Empty(stringResource(R.string.menu_empty))
            shown.isEmpty -> Empty(stringResource(R.string.menu_no_results, query))
            else -> MenuRows(rows, listState, onItemClick)
        }
    }
}

private sealed interface Row {
    data class SectionHeader(val section: Menu.Section) : Row
    data class CategoryHeader(val category: Menu.Category) : Row
    data class ItemRow(val item: Menu.Item) : Row
}

private fun flatten(menu: Menu): List<Row> = menu.sections.flatMap { s ->
    listOf<Row>(Row.SectionHeader(s)) + s.categories.flatMap { c -> listOf<Row>(Row.CategoryHeader(c)) + c.items.map { Row.ItemRow(it) } }
}

@Composable
private fun MenuRows(rows: List<Row>, state: LazyListState, onItemClick: ((Menu.Item) -> Unit)?) {
    LazyColumn(state = state, modifier = Modifier.fillMaxSize()) {
        items(rows, key = { r ->
            when (r) {
                is Row.SectionHeader -> "s-${r.section.id}"
                is Row.CategoryHeader -> "c-${r.category.id}"
                is Row.ItemRow -> "i-${r.item.id}"
            }
        }) { r ->
            when (r) {
                is Row.SectionHeader -> Column(Modifier.padding(start = Spacing.l, end = Spacing.l, top = Spacing.xxl)) {
                    Text(r.section.name, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                    if (r.section.note.isNotEmpty()) {
                        Text(r.section.note, style = MaterialTheme.typography.bodySmall, color = BarLabColors.Faint)
                    }
                }
                is Row.CategoryHeader -> CategoryLine(r.category.name)
                is Row.ItemRow -> ItemLine(r.item, onItemClick)
            }
        }
    }
}

/** The site's ".cat-line": hairline, spaced uppercase serif label, hairline. */
@Composable
private fun CategoryLine(name: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.m),
        modifier = Modifier.fillMaxWidth().padding(start = Spacing.l, end = Spacing.l, top = Spacing.xxxl, bottom = Spacing.l),
    ) {
        HorizontalDivider(Modifier.weight(1f), thickness = Spacing.hairline, color = BarLabColors.Line)
        Text(name.uppercase(), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary, maxLines = 1)
        HorizontalDivider(Modifier.weight(1f), thickness = Spacing.hairline, color = BarLabColors.Line)
    }
}

@Composable
private fun ItemLine(item: Menu.Item, onClick: ((Menu.Item) -> Unit)?) {
    Column(Modifier.fillMaxWidth().then(if (onClick != null) Modifier.clickable { onClick(item) } else Modifier)) {
        Row(Modifier.padding(horizontal = Spacing.l, vertical = Spacing.listRow), verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(item.name, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                    item.tags.forEach { Tag(it) }
                }
                if (item.description.isNotEmpty()) {
                    Text(
                        item.description,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.secondary,
                        modifier = Modifier.padding(top = Spacing.xs),
                    )
                }
            }
            Spacer(Modifier.width(Spacing.xl))
            Text(Money.format(item.priceCents), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
        }
        HorizontalDivider(thickness = Spacing.hairline, color = BarLabColors.LineFaint, modifier = Modifier.padding(horizontal = Spacing.l))
    }
}

@Composable
private fun Tag(text: String) {
    Text(
        text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = BarLabColors.Slate,
        modifier = Modifier.padding(start = Spacing.s),
    )
}

@Composable
private fun Empty(text: String) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(Spacing.xxl))
}
