// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderHook, waitFor } from "@/test/dom";

import { useRewardsShop } from "./useRewardsShop";

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
  ensureDefaultRewardsCatalog: () => h.state.ensure(),
  normalizeRewardsCatalog: (data: unknown) => data ?? { items: [] },
  trainingRewardsCatalogRef: () => "catalog-ref",
  trainingRedemptionsCollectionRef: () => "redemptions-ref",
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

const UNAVAILABLE = { zh: "数据服务暂时不可用，请稍后再试。", en: "Firestore is not available." };
const CATALOG_FAILED = { zh: "初始化奖励目录失败。", en: "Failed to initialize rewards catalog." };

describe("useRewardsShop: errors", () => {
  it("says the data service is unavailable in the language, and follows a change of language", async () => {
    h.state.db = null;
    const { result, rerender } = renderHook(() => useRewardsShop());
    await waitFor(() => expect(result.current.error).toBe(UNAVAILABLE.zh));

    h.state.settings = { language: "en" };
    rerender();
    expect(result.current.error).toBe(UNAVAILABLE.en);
    expect(result.current.loading).toBe(false);
  });

  it("a failure that is not an Error is reported as the catalog failing, in the language", async () => {
    h.state.settings = { language: "en" };
    h.state.ensure = async () => {
      throw "boom";
    };
    const { result, rerender } = renderHook(() => useRewardsShop());
    await waitFor(() => expect(result.current.error).toBe(CATALOG_FAILED.en));

    h.state.settings = { language: "zh" };
    rerender();
    expect(result.current.error).toBe(CATALOG_FAILED.zh);
  });

  it("a message from the data layer is shown as it arrived, in either language", async () => {
    h.state.ensure = async () => {
      throw new Error("permission-denied");
    };
    const { result, rerender } = renderHook(() => useRewardsShop());
    await waitFor(() => expect(result.current.error).toBe("permission-denied"));
    h.state.settings = { language: "en" };
    rerender();
    expect(result.current.error).toBe("permission-denied");
  });

  it("a failing listener is shown as received and stops the loading", async () => {
    const { result } = renderHook(() => useRewardsShop());
    await waitFor(() => expect(h.state.handlers).toHaveLength(2));
    h.state.handlers[0]!.error(new Error("catalog-listener-denied"));
    await waitFor(() => expect(result.current.error).toBe("catalog-listener-denied"));
    expect(result.current.loading).toBe(false);

    h.state.handlers[1]!.error(new Error("redemptions-listener-denied"));
    await waitFor(() => expect(result.current.error).toBe("redemptions-listener-denied"));
  });

  it("has no error when everything loads", async () => {
    const { result } = renderHook(() => useRewardsShop());
    await waitFor(() => expect(h.state.handlers).toHaveLength(2));
    h.state.handlers[0]!.next({ data: () => ({ items: [] }) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it("not signed in: nothing is loaded and nothing is reported", async () => {
    h.state.uid = null;
    const { result } = renderHook(() => useRewardsShop());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(h.state.handlers).toHaveLength(0);
  });
});
