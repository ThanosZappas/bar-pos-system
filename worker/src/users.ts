import type { Auth } from './google/auth.js';
import { FieldValue, type Firestore } from './google/firestore.js';
import { HttpsError } from './http/errors.js';
import { parseIcon } from './icons.js';
import { LEAD_PIN_MIN_LENGTH } from './pinPolicy.js';
import { isValidUsername, normalizeUsername, usernameToEmail } from './usernames.js';

/**
 * User management. Handlers take their dependencies explicitly so tests can run them
 * against the Auth and Firestore emulators without the Functions emulator.
 *
 * Source of truth for role/active is `users/{uid}` (read by security rules on every
 * request, so changes apply at once). The role is mirrored into a custom claim for the UI.
 */

export const ROLES = ['admin', 'barman', 'server'] as const;
export type Role = (typeof ROLES)[number];
export const MIN_PASSWORD_LENGTH = 6; // Firebase Auth minimum
const MAX_PASSWORD_LENGTH = 128;
const MAX_DISPLAY_NAME_LENGTH = 40;

export interface Deps {
  auth: Auth;
  db: Firestore;
}

/**
 * What a server may do, set by the admin. A missing entry means its default (see RIGHT_DEFAULTS);
 * barman and admin always have every right. The Firestore rules enforce the same table.
 */
export const RIGHT_DEFAULTS = {
  logIn: true, // off: the server cannot use the apps at all (a quick switch, unlike deactivating)
  noApproval: false, // works without asking the barman for permission each shift
  payments: true,
  reversePayments: true,
  closeTables: true,
  cancelOrders: true,
  moveTables: true,
} as const;
export type Right = keyof typeof RIGHT_DEFAULTS;
export type Rights = Partial<Record<Right, boolean>>;

export interface UserDoc {
  username: string;
  displayName: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  rights?: Rights;
  deleted?: boolean;
  /** Profile icon id (see avatars.ts); missing means the role's default. */
  icon?: string;
  /** When the uploaded picture last changed (ms); missing means no picture. */
  photoVersion?: number;
  /** The person has chosen a PIN (see pins.ts). */
  pinSet?: boolean;
}

export function parseRights(raw: unknown): Rights {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new HttpsError('invalid-argument', '"rights" must be an object.');
  const rights: Rights = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in RIGHT_DEFAULTS)) throw new HttpsError('invalid-argument', `Unknown right "${key}".`);
    if (typeof value !== 'boolean') throw new HttpsError('invalid-argument', `Right "${key}" must be true or false.`);
    rights[key as Right] = value;
  }
  return rights;
}

export type Data = Record<string, unknown>;

export function asData(data: unknown): Data {
  if (typeof data !== 'object' || data === null) throw new HttpsError('invalid-argument', 'Missing request data.');
  return data as Data;
}

export function requireString(data: Data, key: string): string {
  const v = data[key];
  if (typeof v !== 'string' || v.trim() === '') throw new HttpsError('invalid-argument', `"${key}" is required.`);
  return v;
}

function parseDisplayName(raw: string): string {
  const name = raw.trim();
  if (name.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new HttpsError('invalid-argument', `Display name must be at most ${MAX_DISPLAY_NAME_LENGTH} characters.`);
  }
  return name;
}

function parseRole(raw: unknown): Role {
  if (typeof raw !== 'string' || !(ROLES as readonly string[]).includes(raw)) {
    throw new HttpsError('invalid-argument', `Role must be one of ${ROLES.join(', ')}.`);
  }
  return raw as Role;
}

export function checkPassword(password: unknown): string {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpsError('invalid-argument', `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new HttpsError('invalid-argument', `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`);
  }
  return password;
}

export async function loadUser(deps: Deps, uid: string): Promise<UserDoc | undefined> {
  return (await deps.db.doc(`users/${uid}`).get()).data() as UserDoc | undefined;
}

export async function requireAdmin(deps: Deps, callerUid: string | undefined): Promise<string> {
  if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const caller = await loadUser(deps, callerUid);
  if (!caller || !caller.active || caller.role !== 'admin') throw new HttpsError('permission-denied', 'Admin only.');
  if (caller.mustChangePassword) throw new HttpsError('failed-precondition', 'Change your password first.');
  return callerUid;
}

export function audit(deps: Deps, action: string, actorUid: string, targetUid: string, details: Data = {}) {
  return deps.db.collection('auditLog').add({ action, actorUid, targetUid, details, at: FieldValue.serverTimestamp() });
}

function authErrorToHttps(e: unknown): never {
  const code = (e as { code?: string }).code ?? '';
  if (code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'That username is taken.');
  if (code === 'auth/invalid-password') throw new HttpsError('invalid-argument', (e as Error).message);
  if (code === 'auth/user-not-found') throw new HttpsError('not-found', 'User not found.');
  throw e;
}

export async function createUser(deps: Deps, callerUid: string | undefined, raw: unknown): Promise<{ uid: string }> {
  const actor = await requireAdmin(deps, callerUid);
  const data = asData(raw);
  const username = normalizeUsername(requireString(data, 'username'));
  if (!isValidUsername(username)) {
    throw new HttpsError('invalid-argument', 'Username: 3–32 characters, lowercase letters, digits, dot, dash or underscore.');
  }
  const displayName = parseDisplayName(requireString(data, 'displayName'));
  const role = parseRole(data.role);
  const password = checkPassword(data.password);
  const rights = data.rights === undefined ? undefined : parseRights(data.rights);
  const icon = data.icon === undefined ? undefined : parseIcon(data.icon);

  let uid: string;
  try {
    uid = (await deps.auth.createUser({ email: usernameToEmail(username), password, displayName })).uid;
  } catch (e) {
    authErrorToHttps(e);
  }
  await deps.auth.setCustomUserClaims(uid, { role });
  const now = FieldValue.serverTimestamp();
  await deps.db.doc(`users/${uid}`).set({
    username,
    displayName,
    role,
    active: true,
    mustChangePassword: true, // the admin's chosen password is temporary
    ...(rights && { rights }),
    ...(icon && { icon }),
    pinSet: false,
    createdAt: now,
    createdBy: actor,
    updatedAt: now,
    updatedBy: actor,
  });
  await audit(deps, 'user.create', actor, uid, { username, role });
  return { uid };
}

export async function updateUser(deps: Deps, callerUid: string | undefined, raw: unknown): Promise<void> {
  const actor = await requireAdmin(deps, callerUid);
  const data = asData(raw);
  const uid = requireString(data, 'uid');
  const target = await loadUser(deps, uid);
  if (!target) throw new HttpsError('not-found', 'User not found.');

  const changes: Partial<UserDoc> = {};
  if (data.displayName !== undefined) changes.displayName = parseDisplayName(requireString(data, 'displayName'));
  if (data.role !== undefined) changes.role = parseRole(data.role);
  if (data.active !== undefined) {
    if (typeof data.active !== 'boolean') throw new HttpsError('invalid-argument', '"active" must be true or false.');
    changes.active = data.active;
  }
  // Rights are merged: the call names only the rights it changes.
  if (data.rights !== undefined) changes.rights = { ...(target.rights ?? {}), ...parseRights(data.rights) };
  if (Object.keys(changes).length === 0) throw new HttpsError('invalid-argument', 'Nothing to change.');
  if (uid === actor && (changes.active === false || (changes.role !== undefined && changes.role !== 'admin'))) {
    throw new HttpsError('failed-precondition', 'You cannot deactivate yourself or remove your own admin role.');
  }

  try {
    await deps.auth.updateUser(uid, {
      ...(changes.displayName !== undefined && { displayName: changes.displayName }),
      ...(changes.active !== undefined && { disabled: !changes.active }),
    });
  } catch (e) {
    authErrorToHttps(e);
  }
  const roleChanged = changes.role !== undefined && changes.role !== target.role;
  if (roleChanged) await deps.auth.setCustomUserClaims(uid, { role: changes.role });
  // Sign the user out everywhere when their access changes; rules already deny via the user doc.
  if (roleChanged || changes.active === false) await deps.auth.revokeRefreshTokens(uid);
  // Admin and barman need a longer PIN: a shorter one from the old role is cleared, and the next
  // sign-in (with the password) asks for a new one.
  if (roleChanged && changes.role !== 'server') {
    const pinRef = deps.db.doc(`pinSecrets/${uid}`);
    const length = (await pinRef.get()).get('pin.length');
    if (typeof length === 'number' && length < LEAD_PIN_MIN_LENGTH) {
      await pinRef.delete();
      changes.pinSet = false;
    }
  }

  await deps.db.doc(`users/${uid}`).update({ ...changes, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor });
  await audit(deps, 'user.update', actor, uid, { ...changes });
}

export async function resetPassword(deps: Deps, callerUid: string | undefined, raw: unknown): Promise<void> {
  const actor = await requireAdmin(deps, callerUid);
  const data = asData(raw);
  const uid = requireString(data, 'uid');
  const password = checkPassword(data.password);
  if (!(await loadUser(deps, uid))) throw new HttpsError('not-found', 'User not found.');

  try {
    await deps.auth.updateUser(uid, { password });
  } catch (e) {
    authErrorToHttps(e);
  }
  await deps.auth.revokeRefreshTokens(uid);
  await deps.db.doc(`users/${uid}`).update({
    mustChangePassword: true,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor,
  });
  await audit(deps, 'user.resetPassword', actor, uid); // never log the password
}

/** First-login (or after reset) password change. Clears the flag only together with the change. */
export async function changeOwnPassword(deps: Deps, callerUid: string | undefined, raw: unknown): Promise<void> {
  if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const me = await loadUser(deps, callerUid);
  if (!me || !me.active) throw new HttpsError('permission-denied', 'This account is deactivated.');
  const password = checkPassword(asData(raw).password);
  if (password === me.username + me.username) {
    throw new HttpsError('invalid-argument', 'Choose a password different from the initial one.');
  }

  await deps.auth.updateUser(callerUid, { password });
  await deps.db.doc(`users/${callerUid}`).update({
    mustChangePassword: false,
    passwordChangedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: callerUid,
  });
  await audit(deps, 'user.changeOwnPassword', callerUid, callerUid);
}

/**
 * Deletes a user's login (so the username can be used again) and marks the profile deleted. The
 * profile stays, so names on past orders, payments and the audit log keep making sense. Refuses
 * to delete yourself or the last active admin.
 */
export async function deleteUser(deps: Deps, callerUid: string | undefined, raw: unknown): Promise<void> {
  const actor = await requireAdmin(deps, callerUid);
  const uid = requireString(asData(raw), 'uid');
  if (uid === actor) throw new HttpsError('failed-precondition', 'You cannot delete yourself.');
  const target = await loadUser(deps, uid);
  if (!target || target.deleted) throw new HttpsError('not-found', 'User not found.');
  if (target.role === 'admin') {
    const admins = await deps.db.collection('users').where('role', '==', 'admin').get();
    const others = admins.docs.filter((d) => d.id !== uid && d.get('active') === true && d.get('deleted') !== true);
    if (others.length === 0) throw new HttpsError('failed-precondition', 'Keep at least one admin.');
  }
  try {
    await deps.auth.deleteUser(uid);
  } catch (e) {
    if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
  }
  const now = FieldValue.serverTimestamp();
  await deps.db.doc(`users/${uid}`).update({ active: false, deleted: true, deletedAt: now, deletedBy: actor, updatedAt: now, updatedBy: actor });
  await audit(deps, 'user.delete', actor, uid, { username: target.username });
}
