import { setGlobalOptions } from 'firebase-functions/v2';

// Same region as Firestore (europe-west8, Milan). Few instances: one small bar.
setGlobalOptions({ region: 'europe-west8', maxInstances: 3 });

// Callable functions for user management are added in milestone 2.
