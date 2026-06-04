import {
  getAuthErrorMessage,
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
  authError: string | null;
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
  const [authError, setAuthError] = useState<string | null>(null);
  const [firebaseReady, setFirebaseReady] = useState(false);

  useEffect(() => {
    initFirebase();
    const auth = getFirebaseAuth();

    if (!auth) {
      setFirebaseReady(false);
      setLoading(false);
      setAuthError(
        "Firebase is not configured. Copy .env.example to apps/web/.env.local and set VITE_FIREBASE_* values.",
      );
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
        setAuthError(getAuthErrorMessage(error));
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
        setAuthError("Firebase is not configured.");
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
        setAuthError(getAuthErrorMessage(error));
        throw error;
      }
    },
    [],
  );

  const signInEmailPassword = useCallback(
    async (email: string, password: string) => {
      const auth = getFirebaseAuth();
      if (!auth) {
        setAuthError("Firebase is not configured.");
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
        setAuthError(getAuthErrorMessage(error));
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
      setAuthError(getAuthErrorMessage(error));
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
