// @vitest-environment happy-dom
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen, userEvent, within } from "@/test/dom";
import { controlsBelowTapTarget } from "@/test/tapTarget";
import { denied, watchUnhandledRejections } from "@/test/unhandledRejections";

import { TrainingShopPage } from "./TrainingShopPage";

type Hook = { data: unknown; loading: boolean; error: string | null };

const reward = (id: string, cost: number, extra: Record<string, unknown> = {}) => ({
  id,
  nameZh: `${id}中文名`,
  nameEn: `${id} English name`,
  descriptionZh: `${id}中文说明`,
  descriptionEn: `${id} English description`,
  icon: "🎁",
  cost,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...extra,
});

const h = vi.hoisted(() => {
  const ready = (data: unknown): Hook => ({ data, loading: false, error: null });
  const base = () => ({
    settings: ready({ language: "zh", isPro: false }),
    gamification: ready({ points: 120 }),
    shop: {
      catalog: null as { items: unknown[] } | null,
      redemptions: [] as unknown[],
      loading: false,
      error: null as string | null,
    },
    actions: {
      busy: false,
      actionError: null as string | null,
      lastSuccess: null as { rewardId: string; rewardName: string } | null,
      clearActionError: vi.fn(),
      clearLastSuccess: vi.fn(),
      redeem: vi.fn(async (_id: string, _name: string, _cost: number) => undefined),
    },
  });
  return { ready, base, state: base() };
});

vi.mock("@/app/providers/FirestoreProvider", () => ({
  useUserSettings: () => h.state.settings,
  useGamification: () => h.state.gamification,
}));
vi.mock("@/hooks/useRewardsShop", () => ({ useRewardsShop: () => h.state.shop }));
vi.mock("@/hooks/useRewardActions", () => ({ useRewardActions: () => h.state.actions }));
vi.mock("@/components/FirestoreStatusBanner", () => ({ FirestoreStatusBanner: () => null }));

const original = window.confirm;
const stubConfirm = (answer: boolean) => {
  const spy = vi.fn((_message?: string) => answer);
  window.confirm = spy;
  return spy;
};

afterEach(() => {
  h.state = h.base();
  window.confirm = original;
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <TrainingShopPage />
    </MemoryRouter>,
  );

const setSettings = (language: "zh" | "en", isPro = false) => {
  h.state.settings = h.ready({ language, isPro });
};

const TEXT = {
  zh: {
    title: "奖励商店",
    subtitle: "目录奖励始终可兑换。自定义奖励需要 PRO。",
    points: "当前积分",
    catalog: "目录奖励",
    loading: "加载中…",
    empty: "暂无奖励商品。",
    pts: "分",
    redeem: "兑换",
    redeeming: "兑换中…",
    cannot: "积分不足",
    custom: "自定义奖励",
    proCard: "PRO — 自定义奖励",
    proOn: "PRO 已开启",
    proNote: "自定义奖励管理为 M6 占位功能，完整增删改将在支付与家长功能上线后提供。",
    locked: "开启 PRO 后可创建并管理运动员专属自定义奖励。",
    history: "兑换记录",
    noHistory: "还没有兑换记录。",
    confirm: (name: string, cost: number) => `使用 ${cost} 积分兑换「${name}」？`,
    day: "2026年10月12日",
    success: (name: string) => `兑换成功！快去享受【${name}】吧！`,
    status: { pending: "待确认", approved: "已批准", used: "已使用", cancelled: "已取消" },
  },
  en: {
    title: "Reward shop",
    subtitle: "Catalog rewards are always available. Custom rewards require PRO.",
    points: "Your points",
    catalog: "Catalog rewards",
    loading: "Loading…",
    empty: "No rewards in catalog yet.",
    pts: "pts",
    redeem: "Redeem",
    redeeming: "Redeeming…",
    cannot: "Not enough points",
    custom: "Custom rewards",
    proCard: "PRO — custom rewards",
    proOn: "PRO active",
    proNote:
      "Custom reward management is a placeholder in M6. Full add/edit UI ships with payment and parent tools later.",
    locked: "Unlock PRO to create and manage custom rewards for your athlete.",
    history: "Redemption history",
    noHistory: "No redemptions yet.",
    confirm: (name: string, cost: number) =>
      `Redeem "${name}" for ${cost} ${cost === 1 ? "point" : "points"}?`,
    day: "Oct 12, 2026",
    success: (name: string) => `Redeemed successfully! Enjoy your ${name}.`,
    status: { pending: "Pending", approved: "Approved", used: "Used", cancelled: "Cancelled" },
  },
} as const;

describe.each(["zh", "en"] as const)("TrainingShopPage (%s)", (locale) => {
  const t = TEXT[locale];
  const pick = <T,>(zh: T, en: T) => (locale === "zh" ? zh : en);
  const setLocale = (isPro = false) => setSettings(locale, isPro);
  const name = (r: ReturnType<typeof reward>) => pick(r.nameZh, r.nameEn);
  const description = (r: ReturnType<typeof reward>) => pick(r.descriptionZh, r.descriptionEn);

  const cheap = reward("cheap", 50);
  const dear = reward("dear", 500);
  const gone = reward("gone", 10, { isActive: false });

  it("title and subtitle", () => {
    setLocale();
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: t.title })).toBeTruthy();
    expect(screen.getByText(t.subtitle)).toBeTruthy();
  });

  it("the points card shows the balance, or an ellipsis while loading", () => {
    setLocale();
    const view = renderPage();
    const card = within(screen.getByRole("heading", { name: t.points }).closest("article")!);
    expect(card.getByText("120")).toBeTruthy();
    view.unmount();

    h.state.shop.loading = true;
    renderPage();
    expect(
      within(screen.getByRole("heading", { name: t.points }).closest("article")!).getByText("…"),
    ).toBeTruthy();
  });

  it("catalog: loading, empty, and the rewards cheapest first without the inactive ones", () => {
    setLocale();
    h.state.shop.loading = true;
    const loading = renderPage();
    expect(screen.getByText(t.loading)).toBeTruthy();
    loading.unmount();

    h.state.shop.loading = false;
    h.state.shop.catalog = { items: [] };
    const empty = renderPage();
    expect(screen.getByText(t.empty)).toBeTruthy();
    empty.unmount();

    h.state.shop.catalog = { items: [dear, gone, cheap] };
    renderPage();
    expect(screen.getByRole("heading", { level: 2, name: t.catalog })).toBeTruthy();
    const names = screen.getAllByText(/(中文名|English name)$/).map((e) => e.textContent);
    expect(names).toEqual([name(cheap), name(dear)]);
    expect(screen.queryByText(name(gone))).toBeNull();
  });

  it("a reward shows its name, description, cost and an enabled button when affordable", () => {
    setLocale();
    h.state.shop.catalog = { items: [cheap] };
    renderPage();
    const box = within(screen.getByText(name(cheap)).closest("div.rounded-xl") as HTMLElement);
    expect(box.getByText(description(cheap))).toBeTruthy();
    expect(box.getByText(`50 ${t.pts}`)).toBeTruthy();
    expect((box.getByRole("button", { name: t.redeem }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("not enough points: the button says so and is disabled", () => {
    setLocale();
    h.state.shop.catalog = { items: [dear] };
    renderPage();
    expect((screen.getByRole("button", { name: t.cannot }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("while redeeming, every button says so and is disabled", () => {
    setLocale();
    h.state.shop.catalog = { items: [cheap, dear] };
    h.state.actions.busy = true;
    renderPage();
    const buttons = screen.getAllByRole("button", { name: t.redeeming }) as HTMLButtonElement[];
    expect(buttons).toHaveLength(2);
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });

  it("redeeming asks first, in the language, and then redeems that reward with its name in the language", async () => {
    setLocale();
    h.state.shop.catalog = { items: [cheap] };
    const confirm = stubConfirm(true);
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: t.redeem }));
    expect(confirm).toHaveBeenCalledExactlyOnceWith(t.confirm(name(cheap), 50));
    expect(h.state.actions.clearActionError).toHaveBeenCalled();
    expect(h.state.actions.clearLastSuccess).toHaveBeenCalled();
    expect(h.state.actions.redeem).toHaveBeenCalledExactlyOnceWith("cheap", name(cheap), 50);
  });

  it("asks about one point in the singular", async () => {
    setLocale();
    h.state.shop.catalog = { items: [reward("one", 1)] };
    const confirm = stubConfirm(false);
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: t.redeem }));
    expect(confirm).toHaveBeenCalledExactlyOnceWith(t.confirm(pick("one中文名", "one English name"), 1));
    expect(String(confirm.mock.calls[0]?.[0])).toContain(pick("1 积分", "1 point?"));
  });

  it("declining the question redeems nothing", async () => {
    setLocale();
    h.state.shop.catalog = { items: [cheap] };
    stubConfirm(false);
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: t.redeem }));
    expect(h.state.actions.redeem).not.toHaveBeenCalled();
    expect(h.state.actions.clearActionError).not.toHaveBeenCalled();
  });

  it("a load error and an action error are shown as alerts, as received", () => {
    setLocale();
    h.state.shop.error = "load-denied";
    h.state.actions.actionError = "redeem-denied";
    renderPage();
    const alerts = screen.getAllByRole("alert").map((a) => a.textContent);
    expect(alerts).toEqual(["load-denied", "redeem-denied"]);
  });

  it("the success note names what was redeemed, in the language it is read in", () => {
    setLocale();
    h.state.shop.catalog = { items: [cheap] };
    h.state.actions.lastSuccess = { rewardId: "cheap", rewardName: "Name when redeemed" };
    renderPage();
    expect(screen.getByText(t.success(name(cheap)))).toBeTruthy();
  });

  it("the success note falls back to the name stored with the redemption", () => {
    setLocale();
    h.state.shop.catalog = { items: [cheap] };
    h.state.actions.lastSuccess = { rewardId: "removed", rewardName: "Movie night" };
    renderPage();
    expect(screen.getByText(t.success("Movie night"))).toBeTruthy();
  });

  it("free plan: the custom rewards section is locked", () => {
    setLocale(false);
    renderPage();
    expect(screen.getByText(t.locked)).toBeTruthy();
    expect(screen.queryByText(t.proNote)).toBeNull();
  });

  it("PRO: the custom rewards section says it is a placeholder", () => {
    setLocale(true);
    renderPage();
    expect(screen.getByRole("heading", { level: 3, name: t.proCard })).toBeTruthy();
    expect(screen.getAllByText(t.proOn).length).toBeGreaterThan(0);
    expect(screen.getByText(t.proNote)).toBeTruthy();
    expect(screen.queryByText(t.locked)).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: new RegExp(t.custom) })).toBeTruthy();
  });

  it("history: empty, then the entries newest first with date, cost and status", () => {
    setLocale();
    const empty = renderPage();
    expect(screen.getByRole("heading", { level: 2, name: t.history })).toBeTruthy();
    expect(screen.getByText(t.noHistory)).toBeTruthy();
    empty.unmount();

    // The catalog knows "dear" (and also inactive rewards), so its entry shows the name in the
    // current language; "cheap" is gone from it, so its entry keeps the name stored at the time.
    h.state.shop.catalog = { items: [dear, gone] };
    h.state.shop.redemptions = [
      { id: "r1", rewardId: "cheap", rewardName: "Old name", cost: 50, redeemedAt: "2026-10-01T10:00:00.000Z", status: "used" },
      { id: "r2", rewardId: "dear", rewardName: "Name when redeemed", cost: 500, redeemedAt: "2026-10-12T10:00:00.000Z", status: "pending" },
      { id: "r3", rewardId: "gone", rewardName: "Gone when redeemed", cost: 10, redeemedAt: "2026-09-01T10:00:00.000Z", status: "approved" },
    ];
    renderPage();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]!.textContent).toContain(name(dear));
    expect(items[0]!.textContent).not.toContain("Name when redeemed");
    expect(items[0]!.textContent).toContain(t.day);
    expect(items[0]!.textContent).toContain(`−500 ${t.pts}`);
    expect(items[0]!.textContent).toContain(t.status.pending);
    expect(items[1]!.textContent).toContain("Old name");
    expect(items[1]!.textContent).toContain(t.status.used);
    expect(items[2]!.textContent).toContain(name(gone));
  });
});

describe("TrainingShopPage: tap targets (44px)", () => {
  it("the redeem buttons ask for 44px, with and without enough points", () => {
    h.state.shop.catalog = { items: [reward("cheap", 50), reward("dear", 900)] };
    const { container } = renderPage();
    expect(container.querySelectorAll("button").length).toBe(2);
    expect(controlsBelowTapTarget(container, { skipLinks: true })).toEqual([]);
  });
});

// The hook shows the failure on the page and then rethrows. The click handler must catch it, or it
// becomes "Uncaught (in promise)".
describe("TrainingShopPage: a failed redemption", () => {
  it("no unhandled rejection, the code is logged, and the reward stays redeemable", async () => {
    setSettings("zh");
    h.state.shop.catalog = { items: [reward("cheap", 50)] };
    stubConfirm(true);
    const watcher = watchUnhandledRejections();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    h.state.actions.redeem = vi.fn(async () => {
      throw denied();
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "兑换" }));
    expect(await watcher.settled()).toEqual([]);
    watcher.stop();
    expect(log).toHaveBeenCalledExactlyOnceWith("[training-shop] redeem failed", { code: "permission-denied" });
    expect((screen.getByRole("button", { name: "兑换" }) as HTMLButtonElement).disabled).toBe(false);
    log.mockRestore();
  });
});
