import type { Athlete, AthleteId } from "@skatingx/schema";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** Placeholder roster until Firestore loads `athletes/{athleteId}/profile/main`. */
export const PLACEHOLDER_ATHLETES: Athlete[] = [
  {
    athleteId: "lindsay",
    displayName: "Lindsay Lin",
    birthDate: "2015-01-14",
  },
  {
    athleteId: "demo-skater",
    displayName: "Demo Skater",
    birthDate: "2016-06-01",
  },
];

const DEFAULT_ACTIVE_ATHLETE_ID: AthleteId = "lindsay";

export type ActiveAthleteContextValue = {
  activeAthlete: Athlete;
  athletes: Athlete[];
  setActiveAthleteId: (athleteId: AthleteId) => void;
};

const ActiveAthleteContext = createContext<ActiveAthleteContextValue | null>(
  null,
);

export function ActiveAthleteProvider({ children }: { children: ReactNode }) {
  const [activeAthleteId, setActiveAthleteIdState] =
    useState<AthleteId>(DEFAULT_ACTIVE_ATHLETE_ID);

  const setActiveAthleteId = useCallback((athleteId: AthleteId) => {
    const exists = PLACEHOLDER_ATHLETES.some((a) => a.athleteId === athleteId);
    if (exists) {
      setActiveAthleteIdState(athleteId);
    }
  }, []);

  const value = useMemo((): ActiveAthleteContextValue => {
    const activeAthlete =
      PLACEHOLDER_ATHLETES.find((a) => a.athleteId === activeAthleteId) ??
      PLACEHOLDER_ATHLETES[0];

    return {
      activeAthlete,
      athletes: PLACEHOLDER_ATHLETES,
      setActiveAthleteId,
    };
  }, [activeAthleteId, setActiveAthleteId]);

  return (
    <ActiveAthleteContext.Provider value={value}>
      {children}
    </ActiveAthleteContext.Provider>
  );
}

export function useActiveAthlete(): ActiveAthleteContextValue {
  const ctx = useContext(ActiveAthleteContext);
  if (!ctx) {
    throw new Error(
      "useActiveAthlete must be used within ActiveAthleteProvider",
    );
  }
  return ctx;
}
