import { useEffect, useState } from "react";

const TICK_MS = 60_000;

/**
 * The current instant, refreshed every minute so the page moves to the next day by itself when
 * left open overnight. Only the calendar day depends on it, so a minute is precise enough, and
 * the timer is released on unmount.
 */
export function useNowIso(): string {
  const [now, setNow] = useState(() => new Date().toISOString());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date().toISOString());
    }, TICK_MS);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  return now;
}
