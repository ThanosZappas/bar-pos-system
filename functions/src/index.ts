import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import * as avatars from './avatars.js';
import * as devices from './devices.js';
import * as pins from './pins.js';
import * as tables from './tables.js';
import * as users from './users.js';

// Same region as Firestore (europe-west8, Milan). Few instances: one small bar.
setGlobalOptions({ region: 'europe-west8', maxInstances: 3 });

initializeApp();
const deps: users.Deps = { auth: getAuth(), db: getFirestore() };

// Mixed into every PIN hash (see pins.ts). Production: Secret Manager (README "First-time setup");
// emulators: functions/.secret.local, which scripts/try-on-phone.sh creates and git ignores.
const pinPepper = defineSecret('PIN_PEPPER');
const pinDeps = (): pins.PinDeps => ({ ...deps, pepper: pinPepper.value() });
/** How the caller signed in: 'password', or 'custom' for a PIN (a custom token). */
const caller = (req: CallableRequest): pins.Caller => ({ uid: req.auth?.uid, provider: req.auth?.token.firebase?.sign_in_provider });

// Callable functions are the only way to manage users (create, rename, role, deactivate, reset).
export const createUser = onCall((req) => users.createUser(deps, req.auth?.uid, req.data));
export const updateUser = onCall((req) => users.updateUser(deps, req.auth?.uid, req.data));
export const resetPassword = onCall((req) => users.resetPassword(deps, req.auth?.uid, req.data));
export const changeOwnPassword = onCall((req) => users.changeOwnPassword(deps, req.auth?.uid, req.data));
export const deleteUser = onCall((req) => users.deleteUser(deps, req.auth?.uid, req.data));
export const removeTable = onCall((req) => tables.removeTable(deps, req.auth?.uid, req.data));
export const moveTable = onCall((req) => tables.moveTable(deps, req.auth?.uid, req.data));

// PINs: set your own, admin resets or unlocks.
export const setPin = onCall({ secrets: [pinPepper] }, (req) => pins.setPin(pinDeps(), caller(req), req.data));
export const resetPin = onCall((req) => pins.resetPin(deps, req.auth?.uid, req.data));
export const unlockPin = onCall((req) => pins.unlockPin(deps, req.auth?.uid, req.data));

// Phones and profile sign-in (see devices.ts). deviceProfiles, profileSignIn and forgetProfile are
// called before anyone is signed in; the phone's own key authorises them.
export const registerDevice = onCall((req) => devices.registerDevice(deps, caller(req), req.data));
export const deviceProfiles = onCall((req) => devices.deviceProfiles(deps, req.data));
export const profileSignIn = onCall({ secrets: [pinPepper] }, (req) => devices.profileSignIn(pinDeps(), req.data));
export const forgetProfile = onCall((req) => devices.forgetProfile(deps, req.data));
export const removeDevice = onCall((req) => devices.removeDevice(deps, req.auth?.uid, req.data));
export const setBiometric = onCall((req) => devices.setBiometric(deps, caller(req), req.data));

// Profile icon or picture: your own, or anyone's for the admin.
export const setIcon = onCall((req) => avatars.setIcon(deps, req.auth?.uid, req.data));
