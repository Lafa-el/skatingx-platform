// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { legacyColourClasses } from "@/test/legacyLook";
import { render, screen } from "@/test/dom";

import { VerificationBadge } from "./VerificationBadge";

const locale = vi.hoisted(() => ({ current: "zh" as "zh" | "en" }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => locale.current }));

describe("VerificationBadge", () => {
  it("shows 待确认 for pending data, as text", () => {
    locale.current = "zh";
    render(<VerificationBadge verification="pending" />);
    expect(screen.getByText("待确认").getAttribute("data-verification")).toBe("pending");
  });

  it("shows 已确认 only for verified data", () => {
    locale.current = "zh";
    render(<VerificationBadge verification="verified" />);
    expect(screen.getByText("已确认").getAttribute("data-verification")).toBe("verified");
  });

  it("falls back to pending for an unknown value, never to verified", () => {
    locale.current = "zh";
    render(<VerificationBadge verification={"Verified " as never} />);
    expect(screen.getByText("待确认")).toBeTruthy();
    expect(screen.queryByText("已确认")).toBeNull();
  });

  it("is translated to English", () => {
    locale.current = "en";
    render(<VerificationBadge verification="pending" />);
    expect(screen.getByText("Pending")).toBeTruthy();
  });

  it("pending and verified differ by an icon shape and tone as well as by colour, with no old colour classes", () => {
    locale.current = "zh";
    const pending = render(<VerificationBadge verification="pending" />);
    const pendingTag = screen.getByText("待确认");
    expect(pendingTag.getAttribute("data-tone")).toBe("pending");
    expect(pendingTag.querySelector("svg")).not.toBeNull();
    expect(legacyColourClasses(pending.container)).toEqual([]);
    pending.unmount();
    const verified = render(<VerificationBadge verification="verified" />);
    expect(screen.getByText("已确认").getAttribute("data-tone")).toBe("success");
    expect(legacyColourClasses(verified.container)).toEqual([]);
  });

  it("an unknown value is the pending tone, never success", () => {
    locale.current = "zh";
    render(<VerificationBadge verification={"x" as never} />);
    expect(screen.getByText("待确认").getAttribute("data-tone")).toBe("pending");
  });
});
