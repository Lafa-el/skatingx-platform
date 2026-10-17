// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderHook, waitFor } from "@/test/dom";

import { useTrainingRecords } from "./useTrainingRecords";

type Handlers = { next: (snap: unknown) => void; error: (err: Error) => void };

const h = vi.hoisted(() => {
  const base = () => ({
    uid: "uid-1" as string | null,
    settings: { language: "zh" } as Record<string, unknown> | null,
    db: {} as object | null,
    ensure: (async () => undefined) as () => Promise<unknown>,
    handlers: [] as Handlers[],
  });
  return { base, state: base() };
});

vi.mock("@/app/providers/AuthProvider", () => ({ useAuth: () => ({ uid: h.state.uid }) }));
vi.mock("@/app/providers/FirestoreProvider", () => ({ useUserSettings: () => ({ data: h.state.settings }) }));
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => h.state.db,
  ensureDefaultDistanceRecords: () => h.state.ensure(),
  readDistanceRecordsDocument: (distanceId: string, label: string) => ({ distanceId, label, entries: [] }),
  trainingRecordsCollectionRef: () => "records-ref",
}));
vi.mock("firebase/firestore", () => ({
  onSnapshot: (_ref: unknown, next: Handlers["next"], error: Handlers["error"]) => {
    h.state.handlers.push({ next, error });
    return () => undefined;
  },
}));

afterEach(() => {
  h.state = h.base();
});

const UNAVAILABLE = { zh: "数据服务暂时不可用，请稍后再试。", en: "Firestore is not available right now. Try again later." };
const LOAD_FAILED = { zh: "加载个人最好纪录失败。", en: "Failed to initialize distance records." };

describe("useTrainingRecords: errors", () => {
  it("says the data service is unavailable in the language, and follows a change of language", async () => {
    h.state.db = null;
    const { result, rerender } = renderHook(() => useTrainingRecords());
    await waitFor(() => expect(result.current.error).toBe(UNAVAILABLE.zh));

    h.state.settings = { language: "en" };
    rerender();
    expect(result.current.error).toBe(UNAVAILABLE.en);
  });

  it("a failure that is not an Error is reported as loading failing, in the language", async () => {
    h.state.settings = { language: "en" };
    h.state.ensure = async () => {
      throw "boom";
    };
    const { result, rerender } = renderHook(() => useTrainingRecords());
    await waitFor(() => expect(result.current.error).toBe(LOAD_FAILED.en));

    h.state.settings = { language: "zh" };
    rerender();
    expect(result.current.error).toBe(LOAD_FAILED.zh);
  });

  it("a message from the data layer is shown as it arrived, in either language", async () => {
    h.state.ensure = async () => {
      throw new Error("permission-denied");
    };
    const { result, rerender } = renderHook(() => useTrainingRecords());
    await waitFor(() => expect(result.current.error).toBe("permission-denied"));
    h.state.settings = { language: "en" };
    rerender();
    expect(result.current.error).toBe("permission-denied");
  });

  it("a failing listener is shown as received and stops the loading", async () => {
    const { result } = renderHook(() => useTrainingRecords());
    await waitFor(() => expect(h.state.handlers).toHaveLength(1));
    h.state.handlers[0]!.error(new Error("listener-denied"));
    await waitFor(() => expect(result.current.error).toBe("listener-denied"));
    expect(result.current.loading).toBe(false);
  });

  it("has no error once the records arrive", async () => {
    const { result } = renderHook(() => useTrainingRecords());
    await waitFor(() => expect(h.state.handlers).toHaveLength(1));
    h.state.handlers[0]!.next({ forEach: () => undefined });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
  });
});
