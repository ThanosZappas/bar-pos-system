import { randomUUID } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { MenuSection } from './menu/parse-menu.ts';

export const DEFAULT_TABLE_COUNT = 20;

function stamps() {
  const now = FieldValue.serverTimestamp();
  return { createdAt: now, createdBy: 'seed', updatedAt: now, updatedBy: 'seed' };
}

/** Writes only documents that do not exist yet, so re-seeding never undoes the admin's edits. */
async function createMissing(db: Firestore, collection: string, docs: { id: string; data: Record<string, unknown> }[]): Promise<number> {
  const existing = new Set((await db.collection(collection).select().get()).docs.map((d) => d.id));
  const missing = docs.filter((d) => !existing.has(d.id));
  for (let i = 0; i < missing.length; i += 400) {
    const batch = db.batch();
    for (const d of missing.slice(i, i + 400)) batch.set(db.doc(`${collection}/${d.id}`), d.data);
    await batch.commit();
  }
  return missing.length;
}

export async function seedMenu(db: Firestore, sections: MenuSection[]) {
  const s = sections.map((sec, i) => ({
    id: sec.id,
    data: { name: sec.name, note: sec.note, order: i, hidden: false, archived: false, ...stamps() },
  }));
  const c = sections.flatMap((sec) =>
    sec.categories.map((cat, i) => ({
      id: cat.id,
      data: { sectionId: sec.id, name: cat.name, order: i, hidden: false, archived: false, ...stamps() },
    })),
  );
  const it = sections.flatMap((sec) =>
    sec.categories.flatMap((cat) =>
      cat.items.map((item, i) => ({
        id: item.id,
        data: {
          categoryId: cat.id,
          name: item.name,
          description: item.description,
          priceCents: item.priceCents,
          tags: item.tags,
          order: i,
          hidden: false,
          archived: false,
          ...stamps(),
        },
      })),
    ),
  );
  return {
    sections: await createMissing(db, 'menuSections', s),
    categories: await createMissing(db, 'menuCategories', c),
    items: await createMissing(db, 'menuItems', it),
  };
}

/** Tables "1".."20". Each table carries the id of its current session (rotated when a paid table is closed). */
export async function seedTables(db: Firestore, count = DEFAULT_TABLE_COUNT): Promise<number> {
  const tables = Array.from({ length: count }, (_, i) => ({
    id: `table-${String(i + 1).padStart(2, '0')}`,
    data: { name: String(i + 1), order: i, archived: false, currentSessionId: randomUUID(), ...stamps() },
  }));
  return createMissing(db, 'tables', tables);
}

/** Header of the non-fiscal summary, from the barlab.gr footer. Created once; the admin edits it in the dashboard. */
export async function seedSettings(db: Firestore): Promise<boolean> {
  const ref = db.doc('settings/app');
  if ((await ref.get()).exists) return false;
  await ref.set({
    barName: 'Negroni Bar Lab',
    address: 'Κολοκοτρώνη 74–76, Πειραιάς 18535',
    phone: '+30 211 215 8270',
    receiptFooter: '',
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: 'seed',
  });
  return true;
}
