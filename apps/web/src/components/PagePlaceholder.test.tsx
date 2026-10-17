// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/dom";

import { PagePlaceholder } from "./PagePlaceholder";

const state = vi.hoisted(() => ({ locale: "zh" as "zh" | "en" }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => state.locale }));

afterEach(() => {
  state.locale = "zh";
});

describe("PagePlaceholder", () => {
  it("shows the title it is given and the default note in Chinese", () => {
    render(<PagePlaceholder title="某页面" />);
    expect(screen.getByRole("heading", { name: "某页面" })).toBeTruthy();
    expect(screen.getByText("占位页面：原有功能将在后续阶段迁移。")).toBeTruthy();
  });

  it("default note in English is the previous wording", () => {
    state.locale = "en";
    render(<PagePlaceholder title="Some page" />);
    expect(screen.getByText("Placeholder page — legacy logic will be migrated in a later phase.")).toBeTruthy();
  });

  it("an empty description counts as none, as it did before the text moved into the resources", () => {
    render(<PagePlaceholder title="T" description="" />);
    expect(screen.getByText("占位页面：原有功能将在后续阶段迁移。")).toBeTruthy();
  });

  it("a description passed by the page replaces the default note", () => {
    render(<PagePlaceholder title="T" description="自定义说明" />);
    expect(screen.getByText("自定义说明")).toBeTruthy();
    expect(screen.queryByText("占位页面：原有功能将在后续阶段迁移。")).toBeNull();
  });
});
