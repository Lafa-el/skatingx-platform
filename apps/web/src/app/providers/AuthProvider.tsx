import {
  getFirebaseAuth,
  initFirebase,
  isAnonymousUser,
  linkAnonymousWithEmailPassword,
  refreshAuthUser,
  signInAnonymouslyIfNeeded,
  signInWithEmailPassword,
  signOutUser,
  subscribeToAuthState,
  userNeedsAuthRefresh,
  type User,
} from "@skatingx/firebase-client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  authErrorCode,
  toAuthErrorNote,
  type AuthErrorNote,
} from "@/shared/i18n/auth-messages";

/**
 * For whoever diagnoses a problem: the operation and the error code only. The message can carry
 * the email address, so it is never logged.
 */
function reportAuthFailure(operation: string, error: unknown): void {
  console.error(`[auth] ${operation} failed`, { code: authErrorCode(error) });
}

async function resolveUserSnapshot(
  auth: NonNullable<ReturnType<typeof getFirebaseAuth>>,
  currentUser: User,
): Promise<User> {
  if (!userNeedsAuthRefresh(currentUser)) {
    return currentUser;
  }
  try {
    return await refreshAuthUser(auth);
  } catch {
    return currentUser;
  }
}

export type AuthContextValue = {
  user: User | null;
  uid: string | null;
  isAnonymous: boolean;
  loading: boolean;
  /**
   * What went wrong, not the sentence: this provider sits above the language settings, so the page
   * that shows it writes it in the user's language (`formatAuthError`).
   */
  authError: AuthErrorNote | null;
  firebaseReady: boolean;
  clearAuthError: () => void;
  linkEmailPassword: (email: string, password: string) => Promise<void>;
  signInEmailPassword: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<AuthErrorNote | null>(null);
  const [firebaseReady, setFirebaseReady] = useState(false);

  useEffect(() => {
    initFirebase();
    const auth = getFirebaseAuth();

    if (!auth) {
      setFirebaseReady(false);
      setLoading(false);
      setAuthError({ key: "auth.error.notConfiguredSetup" });
      return;
    }

    setFirebaseReady(true);
    let signingInAnonymously = false;

    const unsubscribe = subscribeToAuthState(auth, async (currentUser) => {
      if (currentUser) {
        signingInAnonymously = false;
        const synced = await resolveUserSnapshot(auth, currentUser);
        setUser(synced);
        setLoading(false);
        return;
      }

      if (signingInAnonymously) {
        return;
      }

      signingInAnonymously = true;
      setLoading(true);
      try {
        await signInAnonymouslyIfNeeded(auth);
      } catch (error) {
        signingInAnonymously = false;
        reportAuthFailure("anonymous sign-in", error);
        setAuthError(toAuthErrorNote(error));
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const linkEmailPassword = useCallback(
    async (email: string, password: string) => {
      const auth = getFirebaseAuth();
      if (!auth) {
        setAuthError({ key: "auth.error.notConfigured" });
        return;
      }
      setAuthError(null);
      try {
        const refreshed = await linkAnonymousWithEmailPassword(
          auth,
          email.trim(),
          password,
        );
        setUser(refreshed);
        setLoading(false);
      } catch (error) {
        reportAuthFailure("account link", error);
        setAuthError(toAuthErrorNote(error));
        throw error;
      }
    },
    [],
  );

  const signInEmailPassword = useCallback(
    async (email: string, password: string) => {
      const auth = getFirebaseAuth();
      if (!auth) {
        setAuthError({ key: "auth.error.notConfigured" });
        return;
      }
      setAuthError(null);
      try {
        const refreshed = await signInWithEmailPassword(
          auth,
          email.trim(),
          password,
        );
        setUser(refreshed);
        setLoading(false);
      } catch (error) {
        reportAuthFailure("sign-in", error);
        setAuthError(toAuthErrorNote(error));
        throw error;
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) {
      return;
    }
    setAuthError(null);
    setLoading(true);
    try {
      await signOutUser(auth);
      setUser(null);
    } catch (error) {
      reportAuthFailure("sign-out", error);
      setAuthError(toAuthErrorNote(error));
      setLoading(false);
    }
  }, []);

  const value = useMemo((): AuthContextValue => {
    return {
      user,
      uid: user?.uid ?? null,
      isAnonymous: isAnonymousUser(user),
      loading,
      authError,
      firebaseReady,
      clearAuthError,
      linkEmailPassword,
      signInEmailPassword,
      logout,
    };
  }, [
    user,
    loading,
    authError,
    firebaseReady,
    clearAuthError,
    linkEmailPassword,
    signInEmailPassword,
    logout,
  ]);

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
