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
import { tAuth } from "@/shared/i18n/auth-messages";
import { tShell } from "@/shared/i18n/shell-messages";
import { type Locale, toLocale } from "@/shared/i18n/translator";

/**
 * Why the data service could not start. It keeps what happened, not the sentence, so the banner
 * writes it in the language the user has when it is shown; a message that came from the data
 * layer is kept as received.
 */
type BootstrapNote =
  | { kind: "notConfigured" | "unavailable" | "initFailed" }
  | { received: string };

function formatBootstrapNote(note: BootstrapNote, locale: Locale): string {
  if ("received" in note) {
    return note.received;
  }
  switch (note.kind) {
    case "notConfigured":
      return tAuth(locale, "auth.error.notConfigured");
    case "unavailable":
      return tShell(locale, "shell.status.unavailable");
    case "initFailed":
      return tShell(locale, "shell.status.initFailed");
  }
}

export type FirestoreHookState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

type FirestoreContextValue = {
  ready: boolean;
  bootstrapNote: BootstrapNote | null;
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
  const [bootstrapNote, setBootstrapNote] = useState<BootstrapNote | null>(null);
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
      setBootstrapNote(firebaseReady ? null : { kind: "notConfigured" });
      setSettings(initialSlice());
      setProfile(initialSlice());
      setGamification(initialSlice());
      setTrainingState(initialSlice());
      return;
    }

    const dbMaybe = getFirestoreDb();
    if (!dbMaybe) {
      setBootstrapNote({ kind: "unavailable" });
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

      setBootstrapNote(null);
      setSettings({ data: null, loading: true, error: null });
      setProfile({ data: null, loading: true, error: null });
      setGamification({ data: null, loading: true, error: null });
      setTrainingState({ data: null, loading: true, error: null });

      await initFirestorePersistence(db);

      try {
        await bootstrapUserDocuments(db, uid);
      } catch (error) {
        if (!cancelled) {
          setBootstrapNote(
            error instanceof Error
              ? { received: error.message }
              : { kind: "initFailed" },
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
      bootstrapNote,
      settings,
      profile,
      gamification,
      trainingState,
      activeAthleteId,
    }),
    [
      ready,
      bootstrapNote,
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

function firstListenerError(
  ctx: FirestoreContextValue,
): string | null {
  return (
    ctx.settings.error ??
    ctx.profile.error ??
    ctx.gamification.error ??
    ctx.trainingState.error ??
    null
  );
}

export function useFirestoreStatus(): {
  ready: boolean;
  bootstrapError: string | null;
  connectivityError: string | null;
} {
  const ctx = useFirestoreContext();
  // The language comes straight from the settings slice: `useLocale` goes through this provider's
  // own hooks, so importing it here would be a cycle.
  const locale = toLocale(ctx.settings.data?.language);
  const bootstrapError = ctx.bootstrapNote ? formatBootstrapNote(ctx.bootstrapNote, locale) : null;
  const connectivityError = bootstrapError ?? (ctx.ready ? firstListenerError(ctx) : null);
  return {
    ready: ctx.ready,
    bootstrapError,
    connectivityError,
  };
}
