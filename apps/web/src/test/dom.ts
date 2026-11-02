import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Node exposes a localStorage getter that is empty unless --localstorage-file is set. Vitest then
// keeps that getter and never copies happy-dom's store, so window.localStorage is missing in tests.
function installPageLocalStorage() {
  if (typeof window === "undefined") return;
  try {
    if (typeof window.localStorage?.getItem === "function") return;
  } catch {
    // The getter throws in some Node builds. Fall through and install a store.
  }
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key) {
      return data.get(String(key)) ?? null;
    },
    key(index) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key) {
      data.delete(String(key));
    },
    setItem(key, value) {
      data.set(String(key), String(value));
    },
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: storage,
  });
}

installPageLocalStorage();

// Vitest globals are off, so Testing Library cannot register its own cleanup (ADR-003 section 4).
afterEach(() => {
  cleanup();
});

export { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
