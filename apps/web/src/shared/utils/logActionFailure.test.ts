import { afterEach, describe, expect, it, vi } from "vitest";

import { logActionFailure } from "./logActionFailure";

afterEach(() => vi.restoreAllMocks());

describe("logActionFailure", () => {
  it("logs the area, the operation and the error code, nothing else", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logActionFailure("training-tasks", "addTask", Object.assign(new Error("users/u1/x denied"), { code: "permission-denied" }));
    expect(spy).toHaveBeenCalledExactlyOnceWith("[training-tasks] addTask failed", { code: "permission-denied" });
  });

  it("never writes the error message: it can carry a document path or what the user typed", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logActionFailure("shop", "redeem", new Error("users/u1/athletes/a1 secret note"));
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/secret|users\/u1/);
  });

  it.each([["boom"], [undefined], [null], [{ code: 42 }]])("copes with a thrown %j", (thrown) => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => logActionFailure("shop", "redeem", thrown)).not.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("an error without a code is logged as code none", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logActionFailure("shop", "redeem", new Error("x"));
    expect(spy).toHaveBeenCalledWith("[shop] redeem failed", { code: "none" });
  });
});
