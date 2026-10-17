// @vitest-environment happy-dom
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/dom";

import { ProLockedCard, ProPlanBanner } from "./ProPlanBanner";

const inRouter = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);

describe("ProPlanBanner", () => {
  it("Chinese, PRO on: no link, the previous wording", () => {
    inRouter(<ProPlanBanner isPro locale="zh" />);
    expect(screen.getByText("PRO 已开启")).toBeTruthy();
    expect(screen.getByText("高阶计划导入与 PRO 专区已解锁（开发开关）。")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("Chinese, free plan: says what is available and links to Settings", () => {
    inRouter(<ProPlanBanner isPro={false} locale="zh" />);
    expect(screen.getByText("免费版")).toBeTruthy();
    expect(screen.getByText("可浏览学院内容与兑换默认奖励。在设置中开启 PRO（开发）以使用高阶导入。")).toBeTruthy();
    expect(screen.getByRole("link", { name: "打开设置" }).getAttribute("href")).toBe("/settings");
  });

  it("English keeps the previous wording, PRO on and off", () => {
    const on = inRouter(<ProPlanBanner isPro locale="en" />);
    expect(screen.getByText("PRO active")).toBeTruthy();
    expect(
      screen.getByText("Advanced routine import and PRO-only sections are unlocked (development flag)."),
    ).toBeTruthy();
    on.unmount();

    inRouter(<ProPlanBanner isPro={false} locale="en" />);
    expect(screen.getByText("Free plan")).toBeTruthy();
    expect(
      screen.getByText(
        "Browse Academy content and redeem catalog rewards. Enable PRO in Settings (dev) for advanced imports.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Settings" }).getAttribute("href")).toBe("/settings");
  });

  it("passes the extra class name on to the box in both states", () => {
    const on = inRouter(<ProPlanBanner isPro locale="zh" className="mt-9" />);
    expect(on.container.firstElementChild?.className).toContain("mt-9");
    on.unmount();
    const off = inRouter(<ProPlanBanner isPro={false} locale="zh" className="mt-9" />);
    expect(off.container.firstElementChild?.className).toContain("mt-9");
  });
});

describe("ProLockedCard", () => {
  it("Chinese: title, the message it was given, and the link", () => {
    inRouter(<ProLockedCard locale="zh" message="开启 PRO 后可使用。" />);
    expect(screen.getByRole("status").textContent).toContain("需要 PRO");
    expect(screen.getByText("开启 PRO 后可使用。")).toBeTruthy();
    expect(screen.getByRole("link", { name: "在设置中开启 PRO（开发）" }).getAttribute("href")).toBe("/settings");
  });

  it("English", () => {
    inRouter(<ProLockedCard locale="en" message="Unlock PRO to use this." className="mt-3" />);
    const card = screen.getByRole("status");
    expect(card.textContent).toContain("PRO required");
    expect(card.className).toContain("mt-3");
    expect(screen.getByText("Unlock PRO to use this.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Enable PRO in Settings (dev)" })).toBeTruthy();
  });
});

// happy-dom does not lay anything out, so the 44px minimum is pinned by its class (min-h-11 is
// 2.75rem) and was measured in a real browser for the PR.
const hasMinHeight44 = (element: HTMLElement) => element.className.split(/\s+/).includes("min-h-11");

describe("tap targets", () => {
  it("the settings link in the free-plan banner is at least 44px tall, in both languages", () => {
    const zh = inRouter(<ProPlanBanner isPro={false} locale="zh" />);
    expect(hasMinHeight44(screen.getByRole("link", { name: "打开设置" }))).toBe(true);
    zh.unmount();
    inRouter(<ProPlanBanner isPro={false} locale="en" />);
    expect(hasMinHeight44(screen.getByRole("link", { name: "Open Settings" }))).toBe(true);
  });

  it("the settings link in the locked card is at least 44px tall, and still lines up with the text", () => {
    inRouter(<ProLockedCard locale="en" message="Needs PRO." />);
    const link = screen.getByRole("link", { name: "Enable PRO in Settings (dev)" });
    expect(hasMinHeight44(link)).toBe(true);
    // Centred in its taller box, so the text does not sit at the top edge.
    expect(link.className.split(/\s+/)).toContain("items-center");
  });
});
