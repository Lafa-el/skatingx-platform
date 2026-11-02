// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/dom";

import { AnalysisProGate } from "./AnalysisProGate";

const locale = vi.hoisted(() => ({ current: "zh" as "zh" | "en" }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => locale.current }));

const pro = vi.hoisted(() => ({ isPro: false, loading: false, error: null as string | null }));
vi.mock("@/hooks/useIsPro", () => ({ useIsPro: () => pro }));

const mounted = vi.hoisted(() => ({ count: 0 }));
function Probe() {
  mounted.count += 1;
  return <p>analysis content</p>;
}

function renderGate() {
  return render(
    <AnalysisProGate>
      <Probe />
    </AnalysisProGate>,
  );
}

beforeEach(() => {
  locale.current = "zh";
  pro.isPro = false;
  pro.loading = false;
  pro.error = null;
  mounted.count = 0;
});

describe("AnalysisProGate", () => {
  it("loading shows only preparing, even when a stale PRO flag is present", () => {
    pro.loading = true;
    pro.isPro = true;
    renderGate();
    expect(screen.getByRole("status").textContent).toContain("正在准备");
    expect(screen.queryByText("这一页需要 PRO")).toBeNull();
    expect(screen.queryByText("analysis content")).toBeNull();
    expect(mounted.count).toBe(0);
  });

  it("a read error stays locked and says why, even if the flag says PRO", () => {
    pro.error = "boom";
    pro.isPro = true;
    renderGate();
    expect(screen.getByRole("alert").textContent).toBe(
      "暂时无法确认你的套餐状态，所以这一页先保持锁定。请检查网络后刷新页面。",
    );
    expect(screen.queryByText("analysis content")).toBeNull();
    expect(mounted.count).toBe(0);
  });

  it("locks a free user without mounting the analysis page", () => {
    renderGate();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("分析");
    expect(screen.getByText("这一页需要 PRO")).toBeTruthy();
    expect(screen.getByText("完整分析能力属于 PRO。")).toBeTruthy();
    expect(screen.getByText("目前由管理员人工开通；在线订阅即将推出")).toBeTruthy();
    expect(screen.queryByText("analysis content")).toBeNull();
    expect(mounted.count).toBe(0);
    expect(screen.queryByRole("link")).toBeNull();
    expect(document.body.textContent).not.toMatch(/受保护|已验证|付款|购买/);
  });

  it("renders the analysis page for a PRO user", () => {
    pro.isPro = true;
    renderGate();
    expect(screen.getByText("analysis content")).toBeTruthy();
    expect(mounted.count).toBeGreaterThan(0);
    expect(screen.queryByText("这一页需要 PRO")).toBeNull();
  });
});
