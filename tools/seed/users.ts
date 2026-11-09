import type { Auth } from 'firebase-admin/auth';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { isValidUsername, usernameToEmail } from '../../functions/src/usernames.ts';

export interface SeedUser {
  username: string;
  displayName: string;
  role: 'admin' | 'barman' | 'server';
  password: string;
  mustChangePassword: boolean;
}

export const CREDENTIALS_FILE = 'seed-credentials.json';
const MIN_PASSWORD_LENGTH = 6; // Firebase Auth minimum

/** The brief's initial accounts: admin + user1..user5, password = username twice. */
export function defaultSeedUsers(): SeedUser[] {
  const admin: SeedUser = { username: 'admin', displayName: 'Admin', role: 'admin', password: 'adminadmin', mustChangePassword: true };
  const servers = [1, 2, 3, 4, 5].map<SeedUser>((n) => ({
    username: `user${n}`,
    displayName: `Server ${n}`,
    role: 'server',
    password: `user${n}user${n}`,
    mustChangePassword: false,
  }));
  return [admin, ...servers];
}

/** Returns a list of problems; empty means the file is usable. */
export function validateSeedUsers(users: unknown): string[] {
  if (!Array.isArray(users) || users.length === 0) return ['"users" must be a non-empty array'];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const [i, u] of (users as Partial<SeedUser>[]).entries()) {
    const where = `users[${i}]`;
    if (typeof u.username !== 'string' || !isValidUsername(u.username)) problems.push(`${where}: invalid username`);
    else if (seen.has(u.username)) problems.push(`${where}: duplicate username ${u.username}`);
    else seen.add(u.username);
    if (typeof u.displayName !== 'string' || u.displayName.trim() === '') problems.push(`${where}: displayName required`);
    if (!['admin', 'barman', 'server'].includes(u.role as string)) problems.push(`${where}: role must be admin, barman or server`);
    if (typeof u.password !== 'string' || u.password.length < MIN_PASSWORD_LENGTH) {
      problems.push(`${where}: password must be at least ${MIN_PASSWORD_LENGTH} characters (Firebase rule)`);
    }
    if (typeof u.mustChangePassword !== 'boolean') problems.push(`${where}: mustChangePassword must be true or false`);
  }
  if (!(users as Partial<SeedUser>[]).some((u) => u.role === 'admin')) problems.push('at least one admin is required');
  return problems;
}

export interface SeedResult {
  created: string[];
  existing: string[];
}

/**
 * Idempotent. Existing accounts keep their password and flags (so re-running the seed
 * never undoes a password the admin already changed); only missing pieces are filled in.
 */
export async function seedUsers(auth: Auth, db: Firestore, users: SeedUser[]): Promise<SeedResult> {
  const result: SeedResult = { created: [], existing: [] };
  for (const u of users) {
    const email = usernameToEmail(u.username);
    let uid: string;
    try {
      uid = (await auth.getUserByEmail(email)).uid;
      result.existing.push(u.username);
    } catch (e) {
      if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
      uid = (await auth.createUser({ email, password: u.password, displayName: u.displayName })).uid;
      await auth.setCustomUserClaims(uid, { role: u.role });
      result.created.push(u.username);
    }
    const ref = db.doc(`users/${uid}`);
    if (!(await ref.get()).exists) {
      const now = FieldValue.serverTimestamp();
      await ref.set({
        username: u.username,
        displayName: u.displayName,
        role: u.role,
        active: true,
        mustChangePassword: u.mustChangePassword,
        createdAt: now,
        createdBy: 'seed',
        updatedAt: now,
        updatedBy: 'seed',
      });
      await db.collection('auditLog').add({ action: 'user.seed', actorUid: 'seed', targetUid: uid, details: { username: u.username, role: u.role }, at: now });
    }
  }
  return result;
}
