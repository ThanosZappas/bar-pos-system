import { randomBytes } from 'node:crypto';
import { GoogleAccess, GoogleApiError } from './access.js';
import { decodeFields, encodeFields, encodeValue, FieldValue, fieldPath, isPlainObject, Timestamp, type Value } from './values.js';

export { FieldValue, Timestamp };

/**
 * Cloud Firestore over its REST API, shaped like the part of firebase-admin's Firestore that the
 * handlers use: documents, == queries, batch reads, transactions and FieldValue markers. Admin
 * access (a service account, or "owner" on the emulator) bypasses the security rules, exactly
 * like the Admin SDK did in Cloud Functions.
 */

type Fields = Record<string, Value>;
interface RestDocument {
  name: string;
  fields?: Fields;
}
interface Write {
  update?: { name: string; fields: Fields };
  delete?: string;
  updateMask?: { fieldPaths: string[] };
  updateTransforms?: Record<string, unknown>[];
  currentDocument?: { exists: boolean };
}

const AUTO_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function autoId(): string {
  // 20 characters from 62, like Firestore's own ids (rejection sampling keeps it uniform).
  let id = '';
  while (id.length < 20) {
    for (const b of randomBytes(40)) if (b < 248 && id.length < 20) id += AUTO_ID_CHARS[b % 62];
  }
  return id;
}

export class Firestore {
  constructor(private readonly access: GoogleAccess) {}

  private get emulatorHost(): string | undefined {
    return this.access.config.firestoreEmulatorHost;
  }

  get databasePath(): string {
    return `projects/${this.access.projectId}/databases/(default)`;
  }

  private get base(): string {
    const host = this.emulatorHost ? `http://${this.emulatorHost}` : 'https://firestore.googleapis.com';
    return `${host}/v1/${this.databasePath}`;
  }

  /** Full resource name of a document path such as "users/abc". */
  name(path: string): string {
    return `${this.databasePath}/documents/${path}`;
  }

  /** @internal */
  call<T>(suffix: string, body?: unknown, method?: string): Promise<T> {
    return this.access.request<T>(`${this.base}${suffix}`, Boolean(this.emulatorHost), { body, method });
  }

  doc(path: string): DocumentReference {
    return new DocumentReference(this, path);
  }

  collection(path: string): CollectionReference {
    return new CollectionReference(this, path);
  }

  /** Several documents in one request (in the order given). */
  getAll(...refs: DocumentReference[]): Promise<DocumentSnapshot[]> {
    return this.batchGet(refs);
  }

  /** @internal */
  async getDoc(ref: DocumentReference, transaction?: string): Promise<DocumentSnapshot> {
    // Inside a transaction, read through batchGet like the Admin SDK (a plain GET with
    // ?transaction= hangs on the emulator).
    if (transaction) return (await this.batchGet([ref], transaction))[0]!;
    try {
      const doc = await this.call<RestDocument>(`/documents/${encodePath(ref.path)}`);
      return new DocumentSnapshot(ref, decodeFields(doc.fields ?? {}));
    } catch (e) {
      if (e instanceof GoogleApiError && e.httpStatus === 404) return new DocumentSnapshot(ref, undefined);
      throw e;
    }
  }

  /** @internal */
  async batchGet(refs: DocumentReference[], transaction?: string): Promise<DocumentSnapshot[]> {
    if (refs.length === 0) return [];
    const rows = await this.call<{ found?: RestDocument; missing?: string }[]>('/documents:batchGet', {
      documents: refs.map((r) => this.name(r.path)),
      ...(transaction && { transaction }),
    });
    const byName = new Map<string, RestDocument | null>();
    for (const row of rows) {
      if (row.found) byName.set(row.found.name, row.found);
      else if (row.missing) byName.set(row.missing, null);
    }
    return refs.map((r) => {
      const doc = byName.get(this.name(r.path));
      return new DocumentSnapshot(r, doc ? decodeFields(doc.fields ?? {}) : undefined);
    });
  }

  /** @internal */
  async runQuery(query: Query, transaction?: string): Promise<QuerySnapshot> {
    const slash = query.collectionPath.lastIndexOf('/');
    const parent = slash < 0 ? '' : `/${encodePath(query.collectionPath.slice(0, slash))}`;
    const collectionId = query.collectionPath.slice(slash + 1);
    const filters = query.filters.map(([field, op, value]) => ({
      fieldFilter: { field: { fieldPath: fieldPath(field.split('.')) }, op: OPERATORS[op], value: encodeValue(value) },
    }));
    const structuredQuery = {
      from: [{ collectionId }],
      ...(filters.length === 1 && { where: filters[0] }),
      ...(filters.length > 1 && { where: { compositeFilter: { op: 'AND', filters } } }),
      ...(query.limitCount !== undefined && { limit: query.limitCount }),
    };
    const rows = await this.call<{ document?: RestDocument }[]>(`/documents${parent}:runQuery`, { structuredQuery, ...(transaction && { transaction }) });
    const docs = rows.filter((r) => r.document).map((r) => {
      const path = r.document!.name.slice(`${this.databasePath}/documents/`.length);
      return new QueryDocumentSnapshot(new DocumentReference(this, path), decodeFields(r.document!.fields ?? {}));
    });
    return new QuerySnapshot(docs);
  }

  /** @internal */
  async commit(writes: Write[], transaction?: string): Promise<void> {
    await this.call('/documents:commit', { writes, ...(transaction && { transaction }) });
  }

  /**
   * Runs [fn] in a read-write transaction, retrying when Firestore aborts it because another
   * transaction touched the same documents (as the Admin SDK does). Reads must come before writes.
   */
  async runTransaction<T>(fn: (tx: Transaction) => Promise<T>, options: { maxAttempts?: number } = {}): Promise<T> {
    const maxAttempts = options.maxAttempts ?? 5;
    let previous: string | undefined;
    for (let attempt = 1; ; attempt++) {
      const { transaction } = await this.call<{ transaction: string }>('/documents:beginTransaction', {
        options: { readWrite: previous ? { retryTransaction: previous } : {} },
      });
      const tx = new Transaction(this, transaction);
      try {
        const result = await fn(tx);
        await this.commit(tx.writes, transaction);
        return result;
      } catch (e) {
        const aborted = e instanceof GoogleApiError && (e.status === 'ABORTED' || e.httpStatus === 409);
        if (!aborted) await this.call('/documents:rollback', { transaction }).catch(() => undefined);
        if (!aborted || attempt >= maxAttempts) throw e;
        previous = transaction;
        await new Promise((r) => setTimeout(r, Math.min(1000, 20 * 2 ** attempt) * (0.5 + Math.random())));
      }
    }
  }
}

const OPERATORS: Record<string, string> = {
  '==': 'EQUAL', '!=': 'NOT_EQUAL', '<': 'LESS_THAN', '<=': 'LESS_THAN_OR_EQUAL', '>': 'GREATER_THAN', '>=': 'GREATER_THAN_OR_EQUAL',
  'array-contains': 'ARRAY_CONTAINS', in: 'IN',
};

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

export class DocumentSnapshot {
  constructor(readonly ref: DocumentReference, private readonly fields: Record<string, unknown> | undefined) {}

  get id(): string {
    return this.ref.id;
  }

  get exists(): boolean {
    return this.fields !== undefined;
  }

  data(): Record<string, any> | undefined {
    return this.fields;
  }

  /** A field by dotted path ("pin.length"); undefined when missing. */
  get(path: string): any {
    let v: unknown = this.fields;
    for (const segment of path.split('.')) {
      if (!isPlainObject(v)) return undefined;
      v = v[segment];
    }
    return v;
  }
}

export class QueryDocumentSnapshot extends DocumentSnapshot {
  override data(): Record<string, any> {
    return super.data()!;
  }
}

export class QuerySnapshot {
  constructor(readonly docs: QueryDocumentSnapshot[]) {}

  get size(): number {
    return this.docs.length;
  }

  get empty(): boolean {
    return this.docs.length === 0;
  }
}

export class Query {
  constructor(
    protected readonly db: Firestore,
    readonly collectionPath: string,
    readonly filters: [string, string, unknown][] = [],
    readonly limitCount?: number,
  ) {}

  where(field: string, op: string, value: unknown): Query {
    if (!(op in OPERATORS)) throw new Error(`Unsupported operator ${op}`);
    return new Query(this.db, this.collectionPath, [...this.filters, [field, op, value]], this.limitCount);
  }

  limit(n: number): Query {
    return new Query(this.db, this.collectionPath, this.filters, n);
  }

  get(): Promise<QuerySnapshot> {
    return this.db.runQuery(this);
  }
}

export class CollectionReference extends Query {
  constructor(db: Firestore, path: string) {
    super(db, path);
  }

  get id(): string {
    return this.collectionPath.slice(this.collectionPath.lastIndexOf('/') + 1);
  }

  /** With no id: a new random id, as Firestore makes them. */
  doc(id: string = autoId()): DocumentReference {
    return new DocumentReference(this.db, `${this.collectionPath}/${id}`);
  }

  async add(data: Record<string, unknown>): Promise<DocumentReference> {
    const ref = this.doc();
    await ref.create(data);
    return ref;
  }
}

export class DocumentReference {
  constructor(private readonly db: Firestore, readonly path: string) {}

  get id(): string {
    return this.path.slice(this.path.lastIndexOf('/') + 1);
  }

  get(): Promise<DocumentSnapshot> {
    return this.db.getDoc(this);
  }

  set(data: Record<string, unknown>, options: { merge?: boolean } = {}): Promise<void> {
    return this.db.commit([setWrite(this.db.name(this.path), data, options.merge === true)]);
  }

  /** Fails if the document does not exist. Keys are field paths ("biometric.abc"). */
  update(data: Record<string, unknown>): Promise<void> {
    return this.db.commit([updateWrite(this.db.name(this.path), data)]);
  }

  /** Fails if the document already exists. */
  create(data: Record<string, unknown>): Promise<void> {
    return this.db.commit([{ ...setWrite(this.db.name(this.path), data, false), currentDocument: { exists: false } }]);
  }

  delete(): Promise<void> {
    return this.db.commit([{ delete: this.db.name(this.path) }]);
  }
}

export class Transaction {
  readonly writes: Write[] = [];

  constructor(private readonly db: Firestore, private readonly id: string) {}

  get(ref: DocumentReference): Promise<DocumentSnapshot>;
  get(query: Query): Promise<QuerySnapshot>;
  get(target: DocumentReference | Query): Promise<DocumentSnapshot | QuerySnapshot> {
    return target instanceof DocumentReference ? this.db.getDoc(target, this.id) : this.db.runQuery(target, this.id);
  }

  getAll(...refs: DocumentReference[]): Promise<DocumentSnapshot[]> {
    return this.db.batchGet(refs, this.id);
  }

  set(ref: DocumentReference, data: Record<string, unknown>, options: { merge?: boolean } = {}): this {
    this.writes.push(setWrite(this.db.name(ref.path), data, options.merge === true));
    return this;
  }

  update(ref: DocumentReference, data: Record<string, unknown>): this {
    this.writes.push(updateWrite(this.db.name(ref.path), data));
    return this;
  }

  create(ref: DocumentReference, data: Record<string, unknown>): this {
    this.writes.push({ ...setWrite(this.db.name(ref.path), data, false), currentDocument: { exists: false } });
    return this;
  }

  delete(ref: DocumentReference): this {
    this.writes.push({ delete: this.db.name(ref.path) });
    return this;
  }
}

// ── Building writes: values go in `fields`, FieldValue markers become transforms or masked-out
// deletions, as the REST API expects. ──

interface Collected {
  transforms: Record<string, unknown>[];
  deletes: string[][];
  leaves: string[][];
}

function transformFor(path: string[], v: FieldValue): Record<string, unknown> {
  const fp = fieldPath(path);
  switch (v.kind) {
    case 'serverTimestamp':
      return { fieldPath: fp, setToServerValue: 'REQUEST_TIME' };
    case 'arrayUnion':
      return { fieldPath: fp, appendMissingElements: { values: v.elements.map(encodeValue) } };
    case 'arrayRemove':
      return { fieldPath: fp, removeAllFromArray: { values: v.elements.map(encodeValue) } };
    default:
      throw new Error('delete() is not a transform');
  }
}

function collect(value: unknown, path: string[], out: Collected): void {
  if (value instanceof FieldValue) {
    if (value.kind === 'delete') out.deletes.push(path);
    else out.transforms.push(transformFor(path, value));
  } else if (isPlainObject(value) && Object.keys(value).length > 0) {
    for (const [k, v] of Object.entries(value)) if (v !== undefined) collect(v, [...path, k], out);
  } else if (value !== undefined) {
    out.leaves.push(path);
  }
}

function setWrite(name: string, data: Record<string, unknown>, merge: boolean): Write {
  const out: Collected = { transforms: [], deletes: [], leaves: [] };
  for (const [k, v] of Object.entries(data)) if (v !== undefined) collect(v, [k], out);
  if (!merge && out.deletes.length) throw new Error('FieldValue.delete() needs merge or update');
  return {
    update: { name, fields: encodeFields(stripMarkers(data)) },
    ...(merge && { updateMask: { fieldPaths: [...out.leaves, ...out.deletes].map(fieldPath) } }),
    ...(out.transforms.length && { updateTransforms: out.transforms }),
  };
}

function updateWrite(name: string, data: Record<string, unknown>): Write {
  const nested: Record<string, unknown> = {};
  const mask: string[] = [];
  const out: Collected = { transforms: [], deletes: [], leaves: [] };
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    const path = key.split('.');
    if (value instanceof FieldValue) {
      if (value.kind === 'delete') mask.push(fieldPath(path));
      else out.transforms.push(transformFor(path, value));
      continue;
    }
    mask.push(fieldPath(path));
    collect(value, path, out); // markers inside a map value
    let target = nested;
    for (const segment of path.slice(0, -1)) target = (target[segment] ??= {}) as Record<string, unknown>;
    target[path[path.length - 1]!] = value;
  }
  return {
    update: { name, fields: encodeFields(stripMarkers(nested)) },
    updateMask: { fieldPaths: mask },
    ...(out.transforms.length && { updateTransforms: out.transforms }),
    currentDocument: { exists: true },
  };
}

function stripMarkers(data: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v instanceof FieldValue) continue;
    clean[k] = isPlainObject(v) ? stripMarkers(v) : v;
  }
  return clean;
}
