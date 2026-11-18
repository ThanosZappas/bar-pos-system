import { makeDeps } from './index';
import type { PinDeps } from './pins';

/** Test helpers for the Auth and Firestore emulators (not deployed). */

export const PROJECT = 'demo-negroni';
export const PEPPER = 'test-pepper-not-a-secret';
export const onEmulators = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST);

/** The Worker's own Firebase client, pointed at the emulators (what runs on Cloudflare, minus the network). */
export function testDeps(): PinDeps {
  return makeDeps({
    FIREBASE_PROJECT_ID: PROJECT,
    FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
    FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
    PIN_PEPPER: PEPPER,
  });
}

export async function clearEmulators(): Promise<void> {
  await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
}

export async function seedUser(deps: PinDeps, username: string, role: string, extra: Record<string, unknown> = {}): Promise<string> {
  const u = await deps.auth.createUser({ email: `${username}@users.negronibarlab.invalid`, password: `${username}${username}` });
  await deps.db.doc(`users/${u.uid}`).set({ username, displayName: username, role, active: true, mustChangePassword: false, ...extra });
  return u.uid;
}

/** Signs in with a custom token at the Auth emulator and returns the ID token's claims. */
export async function signInWithToken(token: string): Promise<Record<string, any>> {
  const res = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, returnSecureToken: true }),
  });
  const body = (await res.json()) as { idToken?: string };
  if (!body.idToken) throw new Error(`sign-in failed: ${JSON.stringify(body)}`);
  return JSON.parse(Buffer.from(body.idToken.split('.')[1]!, 'base64url').toString());
}

export const asPassword = (uid: string) => ({ uid, provider: 'password' });
export const asPin = (uid: string) => ({ uid, provider: 'custom' });
