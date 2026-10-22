/**
 * Parent PIN as a mis-tap gate (ADR-007). The PIN is hashed in the browser and only the hash
 * and salt are written. This is not an account security boundary.
 */

export const PARENT_PIN_LENGTH = 4;

export const PARENT_PIN_ACTIONS = ["passwordReset", "deleteAthlete", "planChange"] as const;

export type ParentPinAction = (typeof PARENT_PIN_ACTIONS)[number];

export const PARENT_PIN_SESSION_KEY = "skatingx.parentPin.unlocked";

export type ParentPinGateInput = {
  action: ParentPinAction;
  /** False until `settings/main` has been read. A missing read does not count as "unset". */
  settingsReady: boolean;
  configured: boolean;
  unlocked: boolean;
};

export function parentPinShapeOk(pin: string): boolean {
  return new RegExp(`^\\d{${PARENT_PIN_LENGTH}}$`).test(pin);
}

/** A PIN is set only when both fields are non-empty strings. */
export function parentPinConfigured(hash: unknown, salt: unknown): boolean {
  return typeof hash === "string" && hash.length > 0 && typeof salt === "string" && salt.length > 0;
}

/**
 * Unset PIN does not block. A set PIN blocks until this session has unlocked.
 * The three actions share that rule on purpose.
 */
export function parentPinAllows(input: ParentPinGateInput): boolean {
  switch (input.action) {
    case "passwordReset":
    case "deleteAthlete":
    case "planChange":
      break;
    default: {
      const unreachable: never = input.action;
      return unreachable;
    }
  }
  if (!input.settingsReady) {
    return false;
  }
  if (!input.configured) {
    return true;
  }
  return input.unlocked;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

export function createParentPinSalt(
  random: (bytes: Uint8Array) => void = (bytes) => crypto.getRandomValues(bytes),
): string {
  const bytes = new Uint8Array(16);
  random(bytes);
  return bytesToHex(bytes);
}

/** SHA-256 of the UTF-8 bytes of `salt + PIN`, as lowercase hex. */
export async function hashParentPin(salt: string, pin: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}${pin}`));
  return bytesToHex(new Uint8Array(digest));
}

export async function parentPinMatches(pin: string, hash: string, salt: string): Promise<boolean> {
  const next = await hashParentPin(salt, pin);
  if (next.length !== hash.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < next.length; index += 1) {
    diff |= next.charCodeAt(index) ^ hash.charCodeAt(index);
  }
  return diff === 0;
}

export function readParentPinUnlock(storage: Pick<Storage, "getItem">, uid: string | null): boolean {
  if (!uid) {
    return false;
  }
  try {
    return storage.getItem(PARENT_PIN_SESSION_KEY) === uid;
  } catch {
    return false;
  }
}

export function writeParentPinUnlock(storage: Pick<Storage, "setItem">, uid: string): void {
  try {
    storage.setItem(PARENT_PIN_SESSION_KEY, uid);
  } catch {
    // A private-mode throw means this session simply stays locked.
  }
}

export function clearParentPinUnlock(storage: Pick<Storage, "removeItem">): void {
  try {
    storage.removeItem(PARENT_PIN_SESSION_KEY);
  } catch {
    // Already unreachable; the next read fails closed.
  }
}
