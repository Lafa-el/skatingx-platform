import { RaceDayValidationError } from "@skatingx/firebase-client";

import type { RaceDayMessageKey } from "../i18n/messages";

/**
 * Maps a failed write or read to a message the user can act on. The raw error is logged
 * separately for developers; it never goes on screen (it can contain document paths).
 */
export type RaceDayErrorKind = "permission" | "network" | "validation" | "unknown";

function errorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error as { code: unknown };
    return typeof code === "string" ? code : null;
  }
  return null;
}

export function classifyError(error: unknown): RaceDayErrorKind {
  if (error instanceof RaceDayValidationError) {
    return "validation";
  }
  const code = errorCode(error);
  if (code === "permission-denied" || code === "unauthenticated") {
    return "permission";
  }
  if (code === "unavailable" || code === "deadline-exceeded" || code === "resource-exhausted") {
    return "network";
  }
  return "unknown";
}

const SAVE_MESSAGE: Record<RaceDayErrorKind, RaceDayMessageKey> = {
  permission: "raceDay.error.savePermission",
  network: "raceDay.error.saveNetwork",
  validation: "raceDay.error.saveValidation",
  unknown: "raceDay.error.saveUnknown",
};

export function saveErrorMessageKey(error: unknown): RaceDayMessageKey {
  return SAVE_MESSAGE[classifyError(error)];
}

export function loadErrorMessageKey(code: string): RaceDayMessageKey {
  return classifyError({ code }) === "permission"
    ? "raceDay.error.loadPermission"
    : "raceDay.error.load";
}

/** Developer-facing context: operation and error code only, never document contents. */
export function logRaceDayError(operation: string, error: unknown): void {
  console.error(`[race-day] ${operation} failed`, {
    code: errorCode(error) ?? "none",
    kind: classifyError(error),
  });
}
