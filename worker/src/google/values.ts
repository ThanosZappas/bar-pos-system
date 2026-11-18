import { Buffer } from 'node:buffer';

/**
 * Firestore values over REST (https://firebase.google.com/docs/firestore/reference/rest/v1/Value),
 * with the same Timestamp and FieldValue shapes as the firebase-admin library, so the handlers
 * read the same either way.
 */

export class Timestamp {
  constructor(readonly seconds: number, readonly nanoseconds: number) {}

  static fromMillis(ms: number): Timestamp {
    const seconds = Math.floor(ms / 1000);
    return new Timestamp(seconds, Math.round((ms - seconds * 1000) * 1e6));
  }

  static now(): Timestamp {
    return Timestamp.fromMillis(Date.now());
  }

  /** RFC 3339, as the REST API writes it ("2026-11-18T20:04:05.123456Z"). */
  static fromString(value: string): Timestamp {
    const m = /^(.*?)(?:\.(\d+))?Z$/.exec(value);
    if (!m) throw new Error(`Bad timestamp ${value}`);
    const seconds = Math.floor(Date.parse(`${m[1]}Z`) / 1000);
    const nanos = m[2] ? Number(m[2].padEnd(9, '0').slice(0, 9)) : 0;
    return new Timestamp(seconds, nanos);
  }

  toMillis(): number {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
  }

  toDate(): Date {
    return new Date(this.toMillis());
  }

  toString(): string {
    const iso = new Date(this.seconds * 1000).toISOString().replace(/\.\d{3}Z$/, '');
    return `${iso}.${String(this.nanoseconds).padStart(9, '0')}Z`;
  }

  isEqual(other: Timestamp): boolean {
    return other instanceof Timestamp && other.seconds === this.seconds && other.nanoseconds === this.nanoseconds;
  }
}

/** Write-time markers (like firebase-admin's FieldValue): applied by the server, not stored as values. */
export class FieldValue {
  private constructor(readonly kind: 'serverTimestamp' | 'delete' | 'arrayUnion' | 'arrayRemove', readonly elements: unknown[] = []) {}

  static serverTimestamp(): FieldValue {
    return new FieldValue('serverTimestamp');
  }

  static delete(): FieldValue {
    return new FieldValue('delete');
  }

  static arrayUnion(...elements: unknown[]): FieldValue {
    return new FieldValue('arrayUnion', elements);
  }

  static arrayRemove(...elements: unknown[]): FieldValue {
    return new FieldValue('arrayRemove', elements);
  }
}

export type Value = Record<string, unknown>;

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Timestamp) && !(v instanceof FieldValue)
    && !(v instanceof Uint8Array) && !(v instanceof Date);
}

export function encodeValue(v: unknown): Value {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Timestamp) return { timestampValue: v.toString() };
  if (v instanceof Date) return { timestampValue: Timestamp.fromMillis(v.getTime()).toString() };
  if (v instanceof Uint8Array) return { bytesValue: Buffer.from(v).toString('base64') };
  if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(encodeValue) } : {} };
  if (isPlainObject(v)) return { mapValue: { fields: encodeFields(v) } };
  throw new Error(`Cannot store ${String(v)} in Firestore`);
}

/** Plain values only (markers are taken out first, see writes in firestore.ts); undefined is skipped. */
export function encodeFields(data: Record<string, unknown>): Record<string, Value> {
  const fields: Record<string, Value> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v instanceof FieldValue) continue;
    fields[k] = encodeValue(v);
  }
  return fields;
}

export function decodeValue(v: Value): unknown {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue as boolean;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue as string;
  if ('timestampValue' in v) return Timestamp.fromString(v.timestampValue as string);
  if ('bytesValue' in v) return Buffer.from(v.bytesValue as string, 'base64');
  if ('referenceValue' in v) return v.referenceValue as string;
  if ('geoPointValue' in v) return v.geoPointValue;
  if ('arrayValue' in v) return (((v.arrayValue as { values?: Value[] }).values) ?? []).map(decodeValue);
  if ('mapValue' in v) return decodeFields(((v.mapValue as { fields?: Record<string, Value> }).fields) ?? {});
  throw new Error(`Unknown Firestore value ${JSON.stringify(v)}`);
}

export function decodeFields(fields: Record<string, Value>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]));
}

/** A field path segment as the REST API wants it: backticks unless it is a plain identifier. */
export function quoteSegment(segment: string): string {
  return /^[a-zA-Z_][a-zA-Z_0-9]*$/.test(segment) ? segment : `\`${segment.replace(/[\\`]/g, (c) => `\\${c}`)}\``;
}

export function fieldPath(segments: string[]): string {
  return segments.map(quoteSegment).join('.');
}
