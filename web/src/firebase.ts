import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getFunctions, httpsCallableFromURL } from 'firebase/functions';

const env = import.meta.env;
const useEmulators = env.VITE_USE_EMULATORS === 'true';

/** The server functions: the Cloudflare Worker (worker/), or the one on this laptop with the emulators. */
const apiUrl = (env.VITE_API_URL || (useEmulators ? `http://${location.hostname}:8787` : '')).replace(/\/+$/, '');

function options(): FirebaseOptions | null {
  // "demo-" projects need no real credentials; the emulators run with --project demo-negroni.
  if (useEmulators) return { projectId: 'demo-negroni', apiKey: 'emulator-only', appId: 'emulator-only' };
  if (!env.VITE_FIREBASE_API_KEY || !env.VITE_FIREBASE_PROJECT_ID || !env.VITE_FIREBASE_APP_ID || !apiUrl) return null;
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
}

const opts = options();
const app = opts ? initializeApp(opts) : null;

/** Null when web/.env.local is missing; the UI then explains what to do. */
export const firebase = app
  ? {
      auth: getAuth(app),
      // On-disk cache shared by open tabs: queued writes survive a reload while offline.
      db: initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }),
      functions: getFunctions(app),
    }
  : null;

if (firebase && useEmulators) {
  const host = location.hostname;
  connectAuthEmulator(firebase.auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(firebase.db, host, 8080);
}

/**
 * A server function by name. The Worker speaks Firebase's callable protocol, so the SDK sends the
 * signed-in person's token and decodes errors exactly as it did for Cloud Functions.
 */
export function callable<Req = unknown, Res = unknown>(name: string) {
  return httpsCallableFromURL<Req, Res>(firebase!.functions, `${apiUrl}/${name}`);
}
