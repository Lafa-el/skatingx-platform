// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/dom";

import { FirestoreStatusBanner } from "./FirestoreStatusBanner";

const state = vi.hoisted(() => ({
  locale: "zh" as "zh" | "en",
  status: { ready: false, connectivityError: null as string | null },
}));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => state.locale }));
vi.mock("@/hooks/firestore", () => ({ useFirestoreStatus: () => state.status }));

afterEach(() => {
  state.locale = "zh";
  state.status = { ready: false, connectivityError: null };
});

describe("FirestoreStatusBanner", () => {
  it("loading, Chinese: a polite status line", () => {
    render(<FirestoreStatusBanner />);
    const line = screen.getByText("正在加载你的数据…");
    expect(line.getAttribute("aria-live")).toBe("polite");
  });

  it("loading, English: the previous wording", () => {
    state.locale = "en";
    render(<FirestoreStatusBanner />);
    expect(screen.getByText("Loading your data…")).toBeTruthy();
  });

  it("connection error: an alert in the active language that still carries the technical reason", () => {
    state.status = { ready: false, connectivityError: "unavailable" };
    render(<FirestoreStatusBanner />);
    expect(screen.getByRole("alert").textContent).toBe("无法连接到 Firestore:unavailable");

    state.locale = "en";
    const { container } = render(<FirestoreStatusBanner />);
    expect(container.textContent).toBe("Unable to connect to Firestore: unavailable");
  });

  it("an error wins over the loading state", () => {
    state.status = { ready: false, connectivityError: "unavailable" };
    render(<FirestoreStatusBanner />);
    expect(screen.queryByText("正在加载你的数据…")).toBeNull();
  });

  it("ready and no error: shows nothing", () => {
    state.status = { ready: true, connectivityError: null };
    const { container } = render(<FirestoreStatusBanner />);
    expect(container.textContent).toBe("");
  });

  it("passes the class name on", () => {
    const { container } = render(<FirestoreStatusBanner className="mt-4" />);
    expect(container.firstElementChild?.className).toContain("mt-4");
  });
});
