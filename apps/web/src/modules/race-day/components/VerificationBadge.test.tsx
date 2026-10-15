// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

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
});
