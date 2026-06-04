import {
  EmailAuthProvider,
  getAuth,
  linkWithCredential,
  onAuthStateChanged,
  reload,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
  type Unsubscribe,
} from "firebase/auth";

import { getFirebaseApp, initFirebase } from "./app";

export type { User };

export function getFirebaseAuth(): Auth | null {
  const app = getFirebaseApp() ?? initFirebase();
  if (!app) {
    return null;
  }
  return getAuth(app);
}

export function subscribeToAuthState(
  auth: Auth,
  listener: (user: User | null) => void,
): Unsubscribe {
  return onAuthStateChanged(auth, listener);
}

export async function signInAnonymouslyIfNeeded(auth: Auth): Promise<User> {
  const user = await signInAnonymously(auth);
  return user.user;
}

/**
 * Reload auth.currentUser so isAnonymous, email, and providerData reflect
 * link/sign-in. onAuthStateChanged often does not fire when UID is unchanged.
 */
export async function refreshAuthUser(auth: Auth): Promise<User> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("No signed-in user to refresh.");
  }
  await reload(currentUser);
  const refreshed = auth.currentUser;
  if (!refreshed) {
    throw new Error("User missing after reload.");
  }
  return refreshed;
}

export async function linkAnonymousWithEmailPassword(
  auth: Auth,
  email: string,
  password: string,
): Promise<User> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("No signed-in user to link.");
  }
  if (!currentUser.isAnonymous) {
    throw new Error("Current user is not anonymous.");
  }
  const credential = EmailAuthProvider.credential(email, password);
  await linkWithCredential(currentUser, credential);
  return refreshAuthUser(auth);
}

export async function signInWithEmailPassword(
  auth: Auth,
  email: string,
  password: string,
): Promise<User> {
  await signInWithEmailAndPassword(auth, email, password);
  return refreshAuthUser(auth);
}

export async function signOutUser(auth: Auth): Promise<void> {
  await signOut(auth);
}

export function getAuthErrorMessage(error: unknown): string {
  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
      ? (error as { code: string }).code
      : null;

  switch (code) {
    case "auth/email-already-in-use":
    case "auth/credential-already-in-use":
      return "This email is already registered. Use the existing account sign-in form below.";
    case "auth/invalid-email":
      return "Invalid email address.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/user-not-found":
      return "No account found for this email.";
    case "auth/too-many-requests":
      return "Too many attempts. Try again later.";
    case "auth/network-request-failed":
      return "Network error. Check your connection.";
    case "auth/operation-not-allowed":
      return "Email/password sign-in is not enabled for this Firebase project.";
    default:
      break;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Authentication failed.";
}
