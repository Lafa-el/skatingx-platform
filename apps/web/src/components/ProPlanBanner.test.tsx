// @vitest-environment happy-dom
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/dom";

import { ProLockedCard, ProPlanBanner } from "./ProPlanBanner";

const inRouter = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);

describe("ProPlanBanner", () => {
  it("Chinese, PRO on: no link, and no mention of a development switch", () => {
    inRouter(<ProPlanBanner isPro locale="zh" />);
    expect(screen.getByText("PRO 已开启")).toBeTruthy();
    expect(screen.getByText("高阶计划导入与 PRO 专区已解锁。")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("Chinese, free plan: says what is available and who opens the rest, with no link", () => {
    inRouter(<ProPlanBanner isPro={false} locale="zh" />);
    expect(screen.getByText("免费版")).toBeTruthy();
    expect(
      screen.getByText("可浏览学院内容与兑换默认奖励。高阶导入目前只对试用账号开放。如需使用，请联系管理员开通。"),
    ).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("English, PRO on and off", () => {
    const on = inRouter(<ProPlanBanner isPro locale="en" />);
    expect(screen.getByText("PRO active")).toBeTruthy();
    expect(screen.getByText("Advanced routine import and PRO-only sections are unlocked.")).toBeTruthy();
    on.unmount();

    inRouter(<ProPlanBanner isPro={false} locale="en" />);
    expect(screen.getByText("Free plan")).toBeTruthy();
    expect(
      screen.getByText(
        "Browse Academy content and redeem catalog rewards. Advanced imports are only available to trial accounts for now. Contact your team admin to get access.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
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
  it("Chinese: title, the message it was given, and who opens it, with no link", () => {
    inRouter(<ProLockedCard locale="zh" message="开启 PRO 后可使用。" />);
    expect(screen.getByRole("status").textContent).toContain("需要 PRO");
    expect(screen.getByText("开启 PRO 后可使用。")).toBeTruthy();
    expect(screen.getByText("目前只对试用账号开放。如需使用，请联系管理员开通。")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("English", () => {
    inRouter(<ProLockedCard locale="en" message="Unlock PRO to use this." className="mt-3" />);
    const card = screen.getByRole("status");
    expect(card.textContent).toContain("PRO required");
    expect(card.className).toContain("mt-3");
    expect(screen.getByText("Unlock PRO to use this.")).toBeTruthy();
    expect(
      screen.getByText("Only available to trial accounts for now. Contact your team admin to get access."),
    ).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
