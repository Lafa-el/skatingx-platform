import { getStorage, type FirebaseStorage } from "firebase/storage";

import { getFirebaseApp, initFirebase } from "../app";

let storageInstance: FirebaseStorage | null = null;

/** Default bucket of the signed-in app. The bucket name is not hardcoded. */
export function getFirebaseStorage(): FirebaseStorage | null {
  const app = getFirebaseApp() ?? initFirebase();
  if (!app) {
    return null;
  }
  if (!storageInstance) {
    storageInstance = getStorage(app);
  }
  return storageInstance;
}
