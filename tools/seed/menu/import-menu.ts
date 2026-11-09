// Turns the saved menu page into menu.json + menu-report.md (both committed, review the report).
//   node menu/import-menu.ts            parse the saved snapshot
//   node menu/import-menu.ts --fetch    download a fresh snapshot from barlab.gr first
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { parseMenuHtml, renderReport } from './parse-menu.ts';

const SOURCE = 'https://www.barlab.gr/menu.html';
const snapshot = new URL('source-menu.html', import.meta.url);

if (process.argv.includes('--fetch')) {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`GET ${SOURCE} → ${res.status}`);
  writeFileSync(snapshot, await res.text());
}
const fetchedAt = statSync(snapshot).mtime.toISOString().slice(0, 10);
const menu = parseMenuHtml(readFileSync(snapshot, 'utf8'));
writeFileSync(new URL('menu.json', import.meta.url), JSON.stringify({ source: SOURCE, snapshot: fetchedAt, sections: menu.sections }, null, 2) + '\n');
writeFileSync(new URL('menu-report.md', import.meta.url), renderReport(menu, SOURCE, fetchedAt));
const items = menu.sections.flatMap((s) => s.categories.flatMap((c) => c.items)).length;
console.log(`menu.json: ${menu.sections.length} sections, ${items} items. ${menu.report.length} report entries in menu-report.md`);
