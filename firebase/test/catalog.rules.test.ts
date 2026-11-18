import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, collection, serverTimestamp, setDoc, updateDoc, Timestamp } from 'firebase/firestore';

let env: RulesTestEnvironment;
const db = (uid: string) => env.authenticatedContext(uid).firestore();
const old = Timestamp.fromMillis(0);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-negroni-catalog',
    firestore: { rules: readFileSync(fileURLToPath(new URL('../firestore.rules', import.meta.url)), 'utf8') },
  });
});
afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore();
    const profile = (role: string, extra = {}) => ({ username: role, displayName: role, role, active: true, mustChangePassword: false, ...extra });
    await setDoc(doc(fs, 'users/admin'), profile('admin'));
    await setDoc(doc(fs, 'users/server'), profile('server'));
    await setDoc(doc(fs, 'users/newAdmin'), profile('admin', { mustChangePassword: true }));
    const stamps = { createdAt: old, createdBy: 'seed', updatedAt: old, updatedBy: 'seed' };
    await setDoc(doc(fs, 'menuSections/s1'), { name: 'Negroni', note: '', order: 0, hidden: false, archived: false, ...stamps });
    await setDoc(doc(fs, 'menuItems/i1'), { categoryId: 'c1', name: 'Classic', description: '', priceCents: 1000, tags: [], order: 0, hidden: false, archived: false, ...stamps });
    await setDoc(doc(fs, 'tables/t1'), { name: '1', order: 0, archived: false, currentSessionId: 'session-0000001', ...stamps });
  });
});

const stampUpdate = (uid: string) => ({ updatedAt: serverTimestamp(), updatedBy: uid });
const stampCreate = (uid: string) => ({ createdAt: serverTimestamp(), createdBy: uid, ...stampUpdate(uid) });
const newItem = (uid: string, extra = {}) => ({
  categoryId: 'c1', name: 'Vortex', description: 'Gin · Mastic', priceCents: 1000, tags: [], order: 1, hidden: false, archived: false, ...stampCreate(uid), ...extra,
});

describe('menu', () => {
  it('all active staff read; signed-out and unconfirmed users do not', async () => {
    await assertSucceeds(getDocs(collection(db('server'), 'menuItems')));
    await assertSucceeds(getDoc(doc(db('admin'), 'menuSections/s1')));
    await assertFails(getDocs(collection(db('newAdmin'), 'menuItems')));
    await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), 'menuItems')));
  });

  it('admin creates and edits items with stamps', async () => {
    await assertSucceeds(setDoc(doc(db('admin'), 'menuItems/i2'), newItem('admin')));
    await assertSucceeds(updateDoc(doc(db('admin'), 'menuItems/i1'), { priceCents: 1100, hidden: true, ...stampUpdate('admin') }));
    await assertSucceeds(updateDoc(doc(db('admin'), 'menuSections/s1'), { name: 'Negronis', order: 2, ...stampUpdate('admin') }));
  });

  it('servers cannot edit the menu', async () => {
    await assertFails(setDoc(doc(db('server'), 'menuItems/i2'), newItem('server')));
    await assertFails(updateDoc(doc(db('server'), 'menuItems/i1'), { priceCents: 1, ...stampUpdate('server') }));
  });

  it('rejects bad data: float or negative price, missing stamps, unknown fields, hard delete', async () => {
    await assertFails(setDoc(doc(db('admin'), 'menuItems/i2'), newItem('admin', { priceCents: 8.5 })));
    await assertFails(setDoc(doc(db('admin'), 'menuItems/i2'), newItem('admin', { priceCents: -100 })));
    await assertFails(setDoc(doc(db('admin'), 'menuItems/i2'), newItem('admin', { colour: 'red' })));
    await assertFails(updateDoc(doc(db('admin'), 'menuItems/i1'), { priceCents: 1100 }));
    await assertFails(updateDoc(doc(db('admin'), 'menuItems/i1'), { priceCents: 1100, updatedAt: serverTimestamp(), updatedBy: 'someone-else' }));
    await assertFails(deleteDoc(doc(db('admin'), 'menuItems/i1')));
  });
});

describe('tables', () => {
  it('staff read; admin adds, renames and reorders', async () => {
    await assertSucceeds(getDocs(collection(db('server'), 'tables')));
    await assertSucceeds(setDoc(doc(db('admin'), 'tables/t2'), { name: '21', order: 20, archived: false, currentSessionId: 'session-0000002', ...stampCreate('admin') }));
    await assertSucceeds(updateDoc(doc(db('admin'), 'tables/t1'), { name: 'Bar 1', order: 3, ...stampUpdate('admin') }));
  });

  it('nobody archives a table or swaps its session directly (removeTable function only)', async () => {
    await assertFails(updateDoc(doc(db('admin'), 'tables/t1'), { archived: true, ...stampUpdate('admin') }));
    await assertFails(updateDoc(doc(db('admin'), 'tables/t1'), { currentSessionId: 'session-9999999', ...stampUpdate('admin') }));
    await assertFails(deleteDoc(doc(db('admin'), 'tables/t1')));
  });

  it('servers cannot add or rename tables', async () => {
    await assertFails(setDoc(doc(db('server'), 'tables/t2'), { name: '21', order: 20, archived: false, currentSessionId: 'session-0000002', ...stampCreate('server') }));
    await assertFails(updateDoc(doc(db('server'), 'tables/t1'), { name: 'X', ...stampUpdate('server') }));
  });
});

describe('sold out', () => {
  it('any active staff member marks an item sold out and back, changing nothing else', async () => {
    await assertSucceeds(updateDoc(doc(db('server'), 'menuItems/i1'), { soldOut: true, ...stampUpdate('server') }));
    await assertSucceeds(updateDoc(doc(db('server'), 'menuItems/i1'), { soldOut: false, ...stampUpdate('server') }));
    await assertSucceeds(updateDoc(doc(db('admin'), 'menuItems/i1'), { soldOut: true, ...stampUpdate('admin') }));
  });
  it('refuses other fields, a non-boolean, someone else\'s stamp, and staff who are not set up', async () => {
    await assertFails(updateDoc(doc(db('server'), 'menuItems/i1'), { soldOut: true, priceCents: 1, ...stampUpdate('server') }));
    await assertFails(updateDoc(doc(db('server'), 'menuItems/i1'), { soldOut: 'yes', ...stampUpdate('server') }));
    await assertFails(updateDoc(doc(db('server'), 'menuItems/i1'), { soldOut: true, ...stampUpdate('admin') }));
    await assertFails(updateDoc(doc(db('newAdmin'), 'menuItems/i1'), { soldOut: true, ...stampUpdate('newAdmin') }));
    await assertFails(updateDoc(doc(env.unauthenticatedContext().firestore(), 'menuItems/i1'), { soldOut: true }));
  });
});
