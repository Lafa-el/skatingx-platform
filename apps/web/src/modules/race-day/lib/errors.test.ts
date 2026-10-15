import { RaceDayValidationError } from "@skatingx/firebase-client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  classifyError,
  loadErrorMessageKey,
  logRaceDayError,
  saveErrorMessageKey,
} from "./errors";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("classifyError", () => {
  it("maps Firestore permission codes to permission", () => {
    expect(classifyError({ code: "permission-denied" })).toBe("permission");
    expect(classifyError({ code: "unauthenticated" })).toBe("permission");
  });

  it("maps connectivity codes to network", () => {
    expect(classifyError({ code: "unavailable" })).toBe("network");
    expect(classifyError({ code: "deadline-exceeded" })).toBe("network");
  });

  it("maps domain validation errors to validation", () => {
    expect(classifyError(new RaceDayValidationError([{ field: "name", code: "required" }]))).toBe(
      "validation",
    );
  });

  it("treats everything else, including non-objects, as unknown", () => {
    expect(classifyError(new Error("boom"))).toBe("unknown");
    expect(classifyError({ code: 42 })).toBe("unknown");
    expect(classifyError(null)).toBe("unknown");
    expect(classifyError("text")).toBe("unknown");
  });
});

describe("message keys", () => {
  it("picks a save message per kind", () => {
    expect(saveErrorMessageKey({ code: "permission-denied" })).toBe("raceDay.error.savePermission");
    expect(saveErrorMessageKey({ code: "unavailable" })).toBe("raceDay.error.saveNetwork");
    expect(saveErrorMessageKey(new Error("x"))).toBe("raceDay.error.saveUnknown");
  });

  it("picks a load message, permission first", () => {
    expect(loadErrorMessageKey("permission-denied")).toBe("raceDay.error.loadPermission");
    expect(loadErrorMessageKey("anything-else")).toBe("raceDay.error.load");
  });
});

describe("logRaceDayError", () => {
  it("logs the operation, code and kind, and never the error message or document data", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = Object.assign(new Error("users/abc/raceDay/secret-event name=Lindsay"), {
      code: "permission-denied",
    });
    logRaceDayError("saveRoster", error);
    expect(spy).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(spy.mock.calls[0]);
    expect(logged).toContain("saveRoster");
    expect(logged).toContain("permission-denied");
    expect(logged).not.toContain("Lindsay");
    expect(logged).not.toContain("secret-event");
  });
});
