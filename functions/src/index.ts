import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';
import * as users from './users.js';

// Same region as Firestore (europe-west8, Milan). Few instances: one small bar.
setGlobalOptions({ region: 'europe-west8', maxInstances: 3 });

initializeApp();
const deps: users.Deps = { auth: getAuth(), db: getFirestore() };

// Callable functions are the only way to manage users (create, rename, role, deactivate, reset).
export const createUser = onCall((req) => users.createUser(deps, req.auth?.uid, req.data));
export const updateUser = onCall((req) => users.updateUser(deps, req.auth?.uid, req.data));
export const resetPassword = onCall((req) => users.resetPassword(deps, req.auth?.uid, req.data));
export const changeOwnPassword = onCall((req) => users.changeOwnPassword(deps, req.auth?.uid, req.data));
