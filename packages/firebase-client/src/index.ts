export { getFirebaseApp, initFirebase } from "./app";
export { bootstrapUserDocuments, type BootstrapResult } from "./firestore/bootstrap";
export { getFirestoreDb } from "./firestore/db";
export {
  initFirestorePersistence,
  isPersistenceEnabled,
  type PersistenceInitResult,
} from "./firestore/persistence";
export {
  athleteGamificationRef,
  athleteProfileRef,
  settingsRef,
  trainingStateRef,
} from "./firestore/refs";
export { subscribeToDocument } from "./firestore/subscribe";
export {
  getAuthErrorMessage,
  getFirebaseAuth,
  linkAnonymousWithEmailPassword,
  refreshAuthUser,
  signInAnonymouslyIfNeeded,
  signInWithEmailPassword,
  signOutUser,
  subscribeToAuthState,
  type User,
} from "./auth";
export { readFirebaseConfigFromEnv, isFirebaseConfigComplete } from "./config";
export type { FirebaseEnvKey } from "./config";
export {
  hasPasswordProvider,
  isAnonymousUser,
  isRegisteredUser,
  userNeedsAuthRefresh,
} from "./user";
