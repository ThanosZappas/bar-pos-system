import { collection, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { firebase } from '../firebase';
import { created, updated, useLive } from './live';

interface Listed {
  order: number;
  hidden: boolean;
  archived: boolean;
}
export interface Section extends Listed {
  name: string;
  note: string;
}
export interface Category extends Listed {
  sectionId: string;
  name: string;
}
export interface Item extends Listed {
  categoryId: string;
  name: string;
  description: string;
  priceCents: number;
  tags: string[];
}
export interface Table {
  name: string;
  order: number;
  archived: boolean;
  currentSessionId: string;
}

export type CatalogCollection = 'menuSections' | 'menuCategories' | 'menuItems' | 'tables';

const db = () => firebase!.db;

export const byOrder = <T extends { order: number }>(rows: T[]) => [...rows].sort((a, b) => a.order - b.order);

/**
 * Live, ordered, non-archived rows. Archived documents are kept for reporting but hidden everywhere.
 * The collections are small, so filtering happens here and Firestore needs no composite index.
 */
export function useCatalog<T extends { order: number; archived: boolean }>(name: CatalogCollection) {
  const rows = useLive<T>(() => collection(db(), name), name);
  return rows && byOrder(rows.filter((r) => !r.archived));
}

export function nextOrder(rows: { order: number }[]): number {
  return rows.reduce((max, r) => Math.max(max, r.order + 1), 0);
}

export async function add(name: CatalogCollection, data: Record<string, unknown>): Promise<void> {
  await setDoc(doc(collection(db(), name)), { ...data, archived: false, ...created() });
}

export async function patch(name: CatalogCollection, id: string, data: Record<string, unknown>): Promise<void> {
  await updateDoc(doc(db(), name, id), { ...data, ...updated() });
}

/** Moves one row up (-1) or down (+1) and renumbers the list 0..n-1 in one batch. */
export async function move(name: CatalogCollection, rows: { id: string; order: number }[], id: string, delta: -1 | 1): Promise<void> {
  const list = byOrder(rows);
  const from = list.findIndex((r) => r.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= list.length) return;
  [list[from], list[to]] = [list[to], list[from]];
  const batch = writeBatch(db());
  list.forEach((r, i) => {
    if (r.order !== i) batch.update(doc(db(), name, r.id), { order: i, ...updated() });
  });
  await batch.commit();
}

export async function addTable(name: string, order: number): Promise<void> {
  await add('tables', { name, order, currentSessionId: crypto.randomUUID() });
}

/** Server-side check: refuses while the table has an open order. */
export async function removeTable(tableId: string): Promise<void> {
  await httpsCallable(firebase!.functions, 'removeTable')({ tableId });
}
