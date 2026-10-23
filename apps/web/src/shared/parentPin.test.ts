import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  PARENT_PIN_ACTIONS,
  PARENT_PIN_SESSION_KEY,
  clearParentPinUnlock,
  createParentPinSalt,
  hashParentPin,
  parentPinAllows,
  parentPinConfigured,
  parentPinMatches,
  parentPinShapeOk,
  readParentPinUnlock,
  writeParentPinUnlock,
} from "./parentPin";

const salt = "ab";
const pin = "1357";

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe("parent PIN hash", () => {
  it("is SHA-256 of the UTF-8 bytes of salt + PIN, and a wrong PIN does not match", async () => {
    const expected = createHash("sha256").update(`${salt}${pin}`, "utf8").digest("hex");
    const hashed = await hashParentPin(salt, pin);
    expect(hashed).toBe(expected);
    expect(hashed).not.toBe(pin);
    expect(await parentPinMatches(pin, hashed, salt)).toBe(true);
    expect(await parentPinMatches("0000", hashed, salt)).toBe(false);
    expect(await parentPinMatches(pin, hashed, "other-salt")).toBe(false);
  });

  it("draws a salt that is not the PIN", () => {
    const drawn = createParentPinSalt((bytes) => {
      bytes.fill(1);
    });
    expect(drawn).toHaveLength(32);
    expect(drawn).not.toContain(pin);
  });
});

describe("parent PIN gate", () => {
  it("does not block any listed action when no PIN is set", () => {
    for (const action of PARENT_PIN_ACTIONS) {
      expect(
        parentPinAllows({ action, settingsReady: true, configured: false, unlocked: false }),
      ).toBe(true);
    }
  });

  it("blocks a set PIN until this session unlocks, then lets the listed actions through", () => {
    for (const action of PARENT_PIN_ACTIONS) {
      expect(
        parentPinAllows({ action, settingsReady: true, configured: true, unlocked: false }),
      ).toBe(false);
      expect(
        parentPinAllows({ action, settingsReady: true, configured: true, unlocked: true }),
      ).toBe(true);
    }
  });

  it("does not treat an unread settings document as unset", () => {
    expect(
      parentPinAllows({
        action: "deleteAthlete",
        settingsReady: false,
        configured: false,
        unlocked: false,
      }),
    ).toBe(false);
  });

  it("is configured only when both hash and salt are non-empty", () => {
    expect(parentPinConfigured("abc", "def")).toBe(true);
    expect(parentPinConfigured("", "def")).toBe(false);
    expect(parentPinConfigured("abc", "")).toBe(false);
    expect(parentPinConfigured(undefined, undefined)).toBe(false);
  });

  it("accepts a 4-digit PIN and nothing else", () => {
    expect(parentPinShapeOk(pin)).toBe(true);
    expect(parentPinShapeOk("135")).toBe(false);
    expect(parentPinShapeOk("13579")).toBe(false);
    expect(parentPinShapeOk("135a")).toBe(false);
  });
});

describe("parent PIN session", () => {
  it("unlocks only the uid that was stored, and logout clears it", () => {
    const storage = memory();
    expect(readParentPinUnlock(storage, "uid-a")).toBe(false);
    writeParentPinUnlock(storage, "uid-a");
    expect(storage.getItem(PARENT_PIN_SESSION_KEY)).toBe("uid-a");
    expect(readParentPinUnlock(storage, "uid-a")).toBe(true);
    expect(readParentPinUnlock(storage, "uid-b")).toBe(false);
    clearParentPinUnlock(storage);
    expect(readParentPinUnlock(storage, "uid-a")).toBe(false);
  });
});
