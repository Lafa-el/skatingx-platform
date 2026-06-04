import {
  bootstrapUserDocuments,
  getFirestoreDb,
  initFirestorePersistence,
  subscribeToDocument,
  athleteGamificationRef,
  athleteProfileRef,
  settingsRef,
  trainingStateRef,
} from "@skatingx/firebase-client";
import type {
  AthleteProfile,
  Gamification,
  TrainingState,
  UserSettings,
} from "@skatingx/schema";
import { DEFAULT_ATHLETE_ID } from "@skatingx/schema";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "@/app/providers/AuthProvider";

export type FirestoreHookState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

type FirestoreContextValue = {
  ready: boolean;
  bootstrapError: string | null;
  persistenceNote: string | null;
  settings: FirestoreHookState<UserSettings>;
  profile: FirestoreHookState<AthleteProfile>;
  gamification: FirestoreHookState<Gamification>;
  trainingState: FirestoreHookState<TrainingState>;
  activeAthleteId: string;
};

const initialSlice = <T,>(): FirestoreHookState<T> => ({
  data: null,
  loading: true,
  error: null,
});

const FirestoreContext = createContext<FirestoreContextValue | null>(null);

export function FirestoreProvider({ children }: { children: ReactNode }) {
  const { uid, loading: authLoading, firebaseReady } = useAuth();
  const [ready, setReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [persistenceNote, setPersistenceNote] = useState<string | null>(null);
  const [settings, setSettings] =
    useState<FirestoreHookState<UserSettings>>(initialSlice);
  const [profile, setProfile] =
    useState<FirestoreHookState<AthleteProfile>>(initialSlice);
  const [gamification, setGamification] =
    useState<FirestoreHookState<Gamification>>(initialSlice);
  const [trainingState, setTrainingState] =
    useState<FirestoreHookState<TrainingState>>(initialSlice);

  const activeAthleteId =
    settings.data?.activeAthleteId ?? DEFAULT_ATHLETE_ID;

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!firebaseReady || !uid) {
      setReady(false);
      setBootstrapError(
        firebaseReady ? null : "Firebase is not configured.",
      );
      setSettings(initialSlice());
      setProfile(initialSlice());
      setGamification(initialSlice());
      setTrainingState(initialSlice());
      return;
    }

    const dbMaybe = getFirestoreDb();
    if (!dbMaybe) {
      setBootstrapError("Firestore is not available.");
      setReady(false);
      return;
    }

    const db = dbMaybe;
    let cancelled = false;
    const unsubs: Array<() => void> = [];

    async function start() {
      if (!uid) {
        return;
      }

      setBootstrapError(null);
      setSettings({ data: null, loading: true, error: null });
      setProfile({ data: null, loading: true, error: null });
      setGamification({ data: null, loading: true, error: null });
      setTrainingState({ data: null, loading: true, error: null });

      const persistence = await initFirestorePersistence(db);
      if (!cancelled && !persistence.enabled) {
        setPersistenceNote(persistence.reason);
      }

      try {
        await bootstrapUserDocuments(db, uid);
      } catch (error) {
        if (!cancelled) {
          setBootstrapError(
            error instanceof Error
              ? error.message
              : "Failed to initialize Firestore documents.",
          );
          setReady(false);
        }
        return;
      }

      if (cancelled) return;

      const settingsDocumentRef = settingsRef(db, uid);
      unsubs.push(
        subscribeToDocument<UserSettings>(
          settingsDocumentRef,
          (data) => setSettings({ data, loading: false, error: null }),
          (message) =>
            setSettings({ data: null, loading: false, error: message }),
        ).unsubscribe,
      );

      const athleteId = DEFAULT_ATHLETE_ID;

      unsubs.push(
        subscribeToDocument<AthleteProfile>(
          athleteProfileRef(db, uid, athleteId),
          (data) => setProfile({ data, loading: false, error: null }),
          (message) =>
            setProfile({ data: null, loading: false, error: message }),
        ).unsubscribe,
      );

      unsubs.push(
        subscribeToDocument<Gamification>(
          athleteGamificationRef(db, uid, athleteId),
          (data) => setGamification({ data, loading: false, error: null }),
          (message) =>
            setGamification({ data: null, loading: false, error: message }),
        ).unsubscribe,
      );

      unsubs.push(
        subscribeToDocument<TrainingState>(
          trainingStateRef(db, uid, athleteId),
          (data) => setTrainingState({ data, loading: false, error: null }),
          (message) =>
            setTrainingState({ data: null, loading: false, error: message }),
        ).unsubscribe,
      );

      setReady(true);
    }

    void start();

    return () => {
      cancelled = true;
      unsubs.forEach((fn) => fn());
    };
  }, [uid, authLoading, firebaseReady]);

  const value = useMemo(
    (): FirestoreContextValue => ({
      ready,
      bootstrapError,
      persistenceNote,
      settings,
      profile,
      gamification,
      trainingState,
      activeAthleteId,
    }),
    [
      ready,
      bootstrapError,
      persistenceNote,
      settings,
      profile,
      gamification,
      trainingState,
      activeAthleteId,
    ],
  );

  return (
    <FirestoreContext.Provider value={value}>
      {children}
    </FirestoreContext.Provider>
  );
}

function useFirestoreContext(): FirestoreContextValue {
  const ctx = useContext(FirestoreContext);
  if (!ctx) {
    throw new Error("Firestore hooks must be used within FirestoreProvider");
  }
  return ctx;
}

export function useUserSettings(): FirestoreHookState<UserSettings> {
  return useFirestoreContext().settings;
}

export function useAthleteProfile(): FirestoreHookState<AthleteProfile> {
  return useFirestoreContext().profile;
}

export function useGamification(): FirestoreHookState<Gamification> {
  return useFirestoreContext().gamification;
}

export function useTrainingState(): FirestoreHookState<TrainingState> {
  return useFirestoreContext().trainingState;
}

/** Active athlete id from settings + profile snapshot for shell UI. */
export function useActiveAthlete(): {
  athleteId: string;
  profile: FirestoreHookState<AthleteProfile>;
  loading: boolean;
  error: string | null;
} {
  const { activeAthleteId, profile, settings } = useFirestoreContext();
  return {
    athleteId: activeAthleteId,
    profile,
    loading: settings.loading || profile.loading,
    error: settings.error ?? profile.error,
  };
}

export function useFirestoreStatus(): {
  ready: boolean;
  bootstrapError: string | null;
  persistenceNote: string | null;
} {
  const { ready, bootstrapError, persistenceNote } = useFirestoreContext();
  return { ready, bootstrapError, persistenceNote };
}
