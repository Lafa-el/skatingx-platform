import { getFirestore, type Firestore } from "firebase/firestore";

import { getFirebaseApp, initFirebase } from "../app";

let dbInstance: Firestore | null = null;

export function getFirestoreDb(): Firestore | null {
  const app = getFirebaseApp() ?? initFirebase();
  if (!app) {
    return null;
  }
  if (!dbInstance) {
    dbInstance = getFirestore(app);
  }
  return dbInstance;
}
