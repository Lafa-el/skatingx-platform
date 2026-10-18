// @vitest-environment happy-dom
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { legacyColourClasses } from "@/test/legacyLook";
import { render, screen } from "@/test/dom";

import { ProGate } from "./ProGate";

const locale = vi.hoisted(() => ({ current: "zh" as "zh" | "en" }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => locale.current }));

const pro = vi.hoisted(() => ({ isPro: false, loading: false, error: null as string | null }));
vi.mock("@/hooks/useIsPro", () => ({ useIsPro: () => pro }));

const mounted = vi.hoisted(() => ({ count: 0 }));
function Probe() {
  mounted.count += 1;
  return <p>secret content</p>;
}

function renderGate() {
  return render(
    <MemoryRouter>
      <ProGate titleKey="raceDay.tab.videos">
        <Probe />
      </ProGate>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  locale.current = "zh";
  pro.isPro = false;
  pro.loading = false;
  pro.error = null;
  mounted.count = 0;
});

describe("ProGate", () => {
  it("shows the content for a PRO user", () => {
    pro.isPro = true;
    renderGate();
    expect(screen.getByText("secret content")).toBeTruthy();
  });

  it("while the plan is loading shows only a preparing message: no locked card, no content", () => {
    pro.loading = true;
    renderGate();
    expect(screen.getByRole("status").textContent).toContain("正在准备");
    expect(screen.queryByText("这一页需要 PRO")).toBeNull();
    expect(screen.queryByText("secret content")).toBeNull();
    expect(mounted.count).toBe(0);
  });

  it("loading wins even if a stale PRO flag is present, so content never flashes", () => {
    pro.loading = true;
    pro.isPro = true;
    renderGate();
    expect(mounted.count).toBe(0);
  });

  it("locks a free user without mounting the content, and says who opens it", () => {
    renderGate();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("视频");
    expect(screen.getByText("这一页需要 PRO")).toBeTruthy();
    expect(screen.getByText("这一页目前只对试用账号开放。如需使用，请联系管理员开通。")).toBeTruthy();
    expect(screen.queryByText("secret content")).toBeNull();
    expect(mounted.count).toBe(0);
  });

  it("sends nobody to Settings: the PRO switch there is a development tool that is going away", () => {
    renderGate();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.body.textContent).not.toMatch(/设置|开启 PRO|球队/);
  });

  it("the read-error card has no link either", () => {
    pro.error = "boom";
    renderGate();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("calls the arrangement provisional and makes no claim of protection", () => {
    renderGate();
    expect(screen.getByText(/临时安排/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/受保护|已验证|订阅|付款|购买/);
  });

  it("a read error keeps the page locked and says why", () => {
    pro.error = "boom";
    pro.isPro = true;
    renderGate();
    expect(screen.getByRole("alert").textContent).toContain("暂时无法确认");
    expect(screen.queryByText("secret content")).toBeNull();
    expect(mounted.count).toBe(0);
  });

  it("English locale", () => {
    locale.current = "en";
    renderGate();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Videos");
    expect(screen.getByText("This page needs PRO")).toBeTruthy();
    expect(
      screen.getByText("This page is only available to trial accounts for now. Contact your team admin to get access."),
    ).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/temporary arrangement/)).toBeTruthy();
  });
});

describe("ProGate look", () => {
  it.each([
    ["loading", () => (pro.loading = true)],
    ["locked", () => undefined],
    ["read error", () => (pro.error = "boom")],
  ])("%s: no old colour classes, navy heading", (_name, apply) => {
    apply();
    const view = renderGate();
    expect(legacyColourClasses(view.container)).toEqual([]);
    expect(screen.getByRole("heading", { level: 1 }).className).toContain("text-brand-navy");
  });

  it("the read error has an icon", () => {
    pro.error = "boom";
    renderGate();
    expect(screen.getByRole("alert").querySelector("svg")).not.toBeNull();
  });
});
