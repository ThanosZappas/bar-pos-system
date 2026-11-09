import { readFileSync } from 'node:fs';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedMenu, seedSettings, seedTables } from './catalog';

const onEmulators = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

describe.skipIf(!onEmulators)('seedMenu and seedTables (emulator)', () => {
  let app: App;
  beforeAll(async () => {
    app = initializeApp({ projectId: 'demo-negroni' }, 'catalog-test');
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-negroni/databases/(default)/documents`, { method: 'DELETE' });
  });
  afterAll(async () => deleteApp(app));

  it('seeds the whole menu once and keeps admin edits on re-run', async () => {
    const db = getFirestore(app);
    const menu = JSON.parse(readFileSync(new URL('menu/menu.json', import.meta.url), 'utf8'));
    expect(await seedMenu(db, menu.sections)).toEqual({ sections: 6, categories: 20, items: 64 });

    await db.doc('menuItems/negroni-c01-i01').update({ priceCents: 1100 });
    expect(await seedMenu(db, menu.sections)).toEqual({ sections: 0, categories: 0, items: 0 });
    expect((await db.doc('menuItems/negroni-c01-i01').get()).get('priceCents')).toBe(1100);
  });

  it('seeds tables 1..20 with a session id each', async () => {
    const db = getFirestore(app);
    expect(await seedTables(db)).toBe(20);
    expect(await seedTables(db)).toBe(0);
    const tables = (await db.collection('tables').orderBy('order').get()).docs;
    expect(tables.map((t) => t.get('name'))).toEqual(Array.from({ length: 20 }, (_, i) => String(i + 1)));
    expect(new Set(tables.map((t) => t.get('currentSessionId'))).size).toBe(20);
  });

  it('creates the receipt settings once', async () => {
    const db = getFirestore(app);
    expect(await seedSettings(db)).toBe(true);
    await db.doc('settings/app').update({ barName: 'Edited' });
    expect(await seedSettings(db)).toBe(false);
    expect((await db.doc('settings/app').get()).get('barName')).toBe('Edited');
  });
});
