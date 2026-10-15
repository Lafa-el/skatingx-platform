// @vitest-environment happy-dom
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  render(
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

  it("locks a free user without mounting the content, and links to Settings", () => {
    renderGate();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("视频");
    expect(screen.getByText("这一页需要 PRO")).toBeTruthy();
    expect(screen.getByRole("link", { name: "前往设置" }).getAttribute("href")).toBe("/settings");
    expect(screen.queryByText("secret content")).toBeNull();
    expect(mounted.count).toBe(0);
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
    expect(screen.getByRole("link", { name: "Go to Settings" })).toBeTruthy();
    expect(screen.getByText(/temporary arrangement/)).toBeTruthy();
  });
});
