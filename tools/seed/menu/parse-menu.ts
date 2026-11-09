import { parsePrice } from './money.ts';

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  tags: string[];
}
export interface MenuCategory {
  id: string;
  name: string;
  items: MenuItem[];
}
export interface MenuSection {
  id: string;
  name: string;
  note: string;
  categories: MenuCategory[];
}
export interface ParsedMenu {
  sections: MenuSection[];
  report: ReportEntry[];
}
export interface ReportEntry {
  kind: 'priceRange' | 'brandList' | 'priceInDescription' | 'duplicateName' | 'textCleanup' | 'askTheBartender' | 'renamed' | 'unparsedPrice';
  where: string;
  detail: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(\w+);/g, (m, name) => ENTITIES[name] ?? m);
}

function text(html: string): string {
  return decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Text with whitespace collapsed, plus whether collapsing changed it (worth a report line). */
function cleaned(html: string): { value: string; changed: boolean } {
  const raw = decode(html.replace(/<[^>]+>/g, ''));
  const value = raw.replace(/\s+/g, ' ').trim();
  return { value, changed: raw.trim() !== value };
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Parses https://www.barlab.gr/menu.html. Two levels: tab (section) → cat-line (category) → items.
 * The page is hand-written HTML with a fixed structure, so targeted regexes are enough.
 */
export function parseMenuHtml(html: string): ParsedMenu {
  const report: ReportEntry[] = [];
  const tabNames = new Map<string, string>();
  for (const m of html.matchAll(/show\('([\w-]+)',\s*this\)">([^<]+)</g)) tabNames.set(m[1], text(m[2]));

  const sectionStarts = [...html.matchAll(/<div id="([\w-]+)" class="section[^"]*">/g)];
  const sections: MenuSection[] = sectionStarts.map((start, si) => {
    const body = html.slice(start.index! + start[0].length, sectionStarts[si + 1]?.index ?? html.indexOf('<footer'));
    const id = start[1];
    const siteName = tabNames.get(id) ?? id;
    const name = siteName.charAt(0).toUpperCase() + siteName.slice(1);
    if (name !== siteName) report.push({ kind: 'renamed', where: name, detail: `Tab "${siteName}" capitalised to "${name}"` });

    const section: MenuSection = { id, name, note: '', categories: [] };
    const token =
      /<p class="note">([\s\S]*?)<\/p>|<div class="cat-line">[\s\S]*?<p>([\s\S]*?)<\/p>|<div class="item-name">([\s\S]*?)<\/div>\s*(?:<div class="item-desc">([\s\S]*?)<\/div>)?[\s\S]*?<div class="item-price">([\s\S]*?)<\/div>/g;
    for (const m of body.matchAll(token)) {
      const [, note, catName, itemName, itemDesc, itemPrice] = m;
      if (note !== undefined) {
        section.note = [section.note, text(note)].filter(Boolean).join(' · ');
      } else if (catName !== undefined) {
        const n = section.categories.length + 1;
        section.categories.push({ id: `${id}-c${pad(n)}`, name: text(catName), items: [] });
      } else {
        if (section.categories.length === 0) section.categories.push({ id: `${id}-c01`, name, items: [] });
        const category = section.categories.at(-1)!;
        const tags = [...itemName.matchAll(/<span class="badge[^"]*">([\s\S]*?)<\/span>/g)].map((b) => text(b[1]));
        const nameText = text(itemName.replace(/<span class="badge[\s\S]*?<\/span>/g, ''));
        const desc = cleaned(itemDesc ?? '');
        const where = `${name} › ${category.name} › ${nameText}`;
        const price = parsePrice(text(itemPrice));
        let description = desc.value;

        if (desc.changed) report.push({ kind: 'textCleanup', where, detail: `Extra spaces removed: "${desc.value}"` });
        if (!price) {
          report.push({ kind: 'unparsedPrice', where, detail: `Price "${text(itemPrice)}" not understood; stored as 0` });
        } else if (price.rangeText) {
          description = [description, `Price ${price.rangeText}`].filter(Boolean).join(' · ');
          report.push({ kind: 'priceRange', where, detail: `"${price.rangeText}" → stored ${price.cents / 100} €, range kept in description` });
        }
        if (/\d\s*€/.test(desc.value)) report.push({ kind: 'priceInDescription', where, detail: `Description mentions a different price: "${desc.value}"` });
        if (id === 'spirits' && desc.value.includes('·')) {
          report.push({ kind: 'brandList', where, detail: `One price for several brands: ${desc.value}` });
        }
        if (/ask the bartender/i.test(desc.value)) report.push({ kind: 'askTheBartender', where, detail: 'Kept as a normal item' });

        if (category.items.some((i) => i.name === nameText)) {
          report.push({ kind: 'duplicateName', where, detail: `Same name as another item in this category; the description tells them apart: "${desc.value}"` });
        }
        category.items.push({
          id: `${category.id}-i${pad(category.items.length + 1)}`,
          name: nameText,
          description,
          priceCents: price?.cents ?? 0,
          tags,
        });
      }
    }
    return section;
  });
  return { sections, report };
}

const KIND_TITLES: Record<ReportEntry['kind'], string> = {
  priceRange: 'Price ranges (lower price stored)',
  brandList: 'Brand lists with a single price',
  priceInDescription: 'Different prices mentioned in descriptions',
  duplicateName: 'Duplicate item names in one category',
  textCleanup: 'Text cleaned up',
  askTheBartender: '"Ask the bartender" items',
  renamed: 'Renamed',
  unparsedPrice: 'Prices not understood',
};

export function renderReport(menu: ParsedMenu, source: string, fetchedAt: string): string {
  const items = menu.sections.flatMap((s) => s.categories.flatMap((c) => c.items));
  const lines = [
    '# Menu import report',
    '',
    `Source: ${source} (snapshot ${fetchedAt}, saved as \`menu/source-menu.html\`).`,
    `Imported ${menu.sections.length} sections, ${menu.sections.reduce((n, s) => n + s.categories.length, 0)} categories, ${items.length} items.`,
    'Prices are stored as integer cents. Review the entries below and adjust items in the dashboard if needed.',
  ];
  for (const kind of Object.keys(KIND_TITLES) as ReportEntry['kind'][]) {
    const entries = menu.report.filter((r) => r.kind === kind);
    if (entries.length === 0) continue;
    lines.push('', `## ${KIND_TITLES[kind]} (${entries.length})`, '');
    for (const e of entries) lines.push(`- **${e.where}**: ${e.detail}`);
  }
  return lines.join('\n') + '\n';
}
