import { useCallback, useState } from "react";

const STORAGE_KEY = "skatingx.raceDay.activeEventId";

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    // Storage can be unavailable (private mode, blocked). The choice then lasts for this visit only.
    console.warn("[race-day] cannot read the saved event choice", error instanceof Error ? error.name : "unknown");
    return null;
  }
}

function writeStored(eventId: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, eventId);
  } catch (error) {
    console.warn("[race-day] cannot save the event choice", error instanceof Error ? error.name : "unknown");
  }
}

/** Remembers which event the user is working on, across reloads. Not shared between devices. */
export function useActiveEventId(): { storedId: string | null; setStoredId: (id: string) => void } {
  const [storedId, setStored] = useState<string | null>(readStored);
  const setStoredId = useCallback((id: string) => {
    writeStored(id);
    setStored(id);
  }, []);
  return { storedId, setStoredId };
}
