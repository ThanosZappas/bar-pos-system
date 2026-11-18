import * as avatars from './avatars.js';
import * as devices from './devices.js';
import { GoogleAccess } from './google/access.js';
import { Auth } from './google/auth.js';
import { Firestore } from './google/firestore.js';
import { handleCall, type Handler } from './http/callable.js';
import * as pins from './pins.js';
import * as tables from './tables.js';
import * as users from './users.js';

/**
 * The Cloudflare Worker: the server side of user management, PIN sign-in, phones, pictures and
 * moving tables, reached by the apps as Firebase callable functions at https://<worker>/<name>.
 * Firebase (free Spark plan) keeps sign-in and the database; the Worker uses them as an admin
 * through a service account. See worker/wrangler.jsonc and README "First-time setup".
 */

export interface Env {
  FIREBASE_PROJECT_ID: string;
  /** Service account (secrets). Absent when running against the local emulators. */
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
  /** Mixed into every PIN hash (secret; see pins.ts). */
  PIN_PEPPER?: string;
  /** Local development only: "127.0.0.1:8080" / "127.0.0.1:9099". */
  FIRESTORE_EMULATOR_HOST?: string;
  FIREBASE_AUTH_EMULATOR_HOST?: string;
}

export function makeDeps(env: Env): pins.PinDeps {
  const access = new GoogleAccess({
    projectId: env.FIREBASE_PROJECT_ID,
    ...(env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY && {
      // Secrets pasted from the JSON key file may keep "\n" escaped.
      serviceAccount: { clientEmail: env.FIREBASE_CLIENT_EMAIL, privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') },
    }),
    firestoreEmulatorHost: env.FIRESTORE_EMULATOR_HOST || undefined,
    authEmulatorHost: env.FIREBASE_AUTH_EMULATOR_HOST || undefined,
  });
  return { auth: new Auth(access), db: new Firestore(access), pepper: env.PIN_PEPPER ?? '' };
}

/** Every function the apps call, by name. */
export function handlers(deps: pins.PinDeps): Record<string, Handler> {
  return {
    // Users (admin), and your own password.
    createUser: (c, d) => users.createUser(deps, c.uid, d),
    updateUser: (c, d) => users.updateUser(deps, c.uid, d),
    resetPassword: (c, d) => users.resetPassword(deps, c.uid, d),
    changeOwnPassword: (c, d) => users.changeOwnPassword(deps, c.uid, d),
    deleteUser: (c, d) => users.deleteUser(deps, c.uid, d),
    // Tables.
    removeTable: (c, d) => tables.removeTable(deps, c.uid, d),
    moveTable: (c, d) => tables.moveTable(deps, c.uid, d),
    // PINs: set your own; the admin resets or unlocks.
    setPin: (c, d) => pins.setPin(deps, c, d),
    resetPin: (c, d) => pins.resetPin(deps, c.uid, d),
    unlockPin: (c, d) => pins.unlockPin(deps, c.uid, d),
    // Phones and profile sign-in. deviceProfiles, profileSignIn and forgetProfile come before
    // anyone is signed in; the phone's own key authorises them.
    registerDevice: (c, d) => devices.registerDevice(deps, c, d),
    deviceProfiles: (_c, d) => devices.deviceProfiles(deps, d),
    profileSignIn: (_c, d) => devices.profileSignIn(deps, d),
    forgetProfile: (_c, d) => devices.forgetProfile(deps, d),
    removeDevice: (c, d) => devices.removeDevice(deps, c.uid, d),
    setBiometric: (c, d) => devices.setBiometric(deps, c, d),
    // Profile icon or picture: your own, or anyone's for the admin.
    setIcon: (c, d) => avatars.setIcon(deps, c.uid, d),
  };
}

let cached: { env: Env; deps: pins.PinDeps; handlers: Record<string, Handler> } | null = null;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!cached || cached.env !== env) {
      const deps = makeDeps(env);
      cached = { env, deps, handlers: handlers(deps) };
    }
    return handleCall(request, cached.deps.auth, cached.handlers);
  },
};
