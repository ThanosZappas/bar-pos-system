import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

export const REGION = 'europe-west8';
const env = import.meta.env;
const useEmulators = env.VITE_USE_EMULATORS === 'true';

function options(): FirebaseOptions | null {
  // "demo-" projects need no real credentials; the emulators run with --project demo-negroni.
  if (useEmulators) return { projectId: 'demo-negroni', apiKey: 'emulator-only', appId: 'emulator-only' };
  if (!env.VITE_FIREBASE_API_KEY || !env.VITE_FIREBASE_PROJECT_ID || !env.VITE_FIREBASE_APP_ID) return null;
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
  ? { auth: getAuth(app), db: getFirestore(app), functions: getFunctions(app, REGION) }
  : null;

if (firebase && useEmulators) {
  const host = location.hostname;
  connectAuthEmulator(firebase.auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(firebase.db, host, 8080);
  connectFunctionsEmulator(firebase.functions, host, 5001);
}
