import { type FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";

import {
  isFirebaseConfigComplete,
  readFirebaseConfigFromEnv,
} from "./config";

let appInstance: FirebaseApp | null = null;

/** Initialize Firebase from VITE_FIREBASE_* env vars. No-op if config is incomplete. */
export function initFirebase(): FirebaseApp | null {
  if (appInstance) {
    return appInstance;
  }

  const existing = getApps();
  if (existing.length > 0) {
    appInstance = getApp();
    return appInstance;
  }

  const config = readFirebaseConfigFromEnv();
  if (!isFirebaseConfigComplete(config)) {
    return null;
  }

  appInstance = initializeApp(config);
  return appInstance;
}

export function getFirebaseApp(): FirebaseApp | null {
  return appInstance ?? (getApps().length > 0 ? getApp() : null);
}

export { readFirebaseConfigFromEnv, isFirebaseConfigComplete } from "./config";
