// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { render, screen, userEvent } from "@/test/dom";

import { EMPTY_VIDEO_FORM } from "../lib/videos";
import { VideoForm } from "./VideoForm";

const locale = vi.hoisted(() => ({ current: "zh" as "zh" | "en" }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => locale.current }));

function setup(props: Partial<Parameters<typeof VideoForm>[0]> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <VideoForm
      editing={false}
      initial={EMPTY_VIDEO_FORM}
      focusOnMount={false}
      saving={false}
      submitErrorKey={null}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { user: userEvent.setup(), onSubmit, onCancel };
}

describe("VideoForm", () => {
  it("has labelled fields and no file input", () => {
    setup();
    expect(screen.getByLabelText(/视频名称/)).toBeTruthy();
    expect(screen.getByLabelText("链接(可选)")).toBeTruthy();
    expect(screen.getByLabelText("存放位置(可选)")).toBeTruthy();
    expect(screen.getByLabelText("备注(可选)")).toBeTruthy();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(document.querySelector("video")).toBeNull();
  });

  it("submits trimmed values, with empty optional fields as null", async () => {
    const { user, onSubmit } = setup();
    await user.type(screen.getByLabelText(/视频名称/), "  500m start  ");
    await user.click(screen.getByRole("button", { name: "保存视频记录" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      label: "  500m start  ",
      externalUrl: null,
      storedWhere: null,
      note: null,
    });
  });

  it("submits the link, location and note when filled", async () => {
    const { user, onSubmit } = setup();
    await user.type(screen.getByLabelText(/视频名称/), "Final");
    await user.type(screen.getByLabelText("链接(可选)"), "https://example.com/v/1");
    await user.type(screen.getByLabelText("存放位置(可选)"), "手机相册");
    await user.type(screen.getByLabelText("备注(可选)"), "第三圈");
    await user.click(screen.getByRole("button", { name: "保存视频记录" }));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      label: "Final",
      externalUrl: "https://example.com/v/1",
      storedWhere: "手机相册",
      note: "第三圈",
    });
  });

  it("blocks an empty name with an error on that field and focus on it", async () => {
    const { user, onSubmit } = setup();
    await user.click(screen.getByRole("button", { name: "保存视频记录" }));
    expect(onSubmit).not.toHaveBeenCalled();
    const name = screen.getByLabelText(/视频名称/);
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("必填")).toBeTruthy();
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(name);
    });
  });

  it("only a link typed: the empty name is the first problem, shown under the name box and focused", async () => {
    const { user, onSubmit } = setup();
    await user.type(screen.getByLabelText("链接(可选)"), "https://example.com/v");
    await user.click(screen.getByRole("button", { name: "保存视频记录" }));
    expect(onSubmit).not.toHaveBeenCalled();
    const name = screen.getByLabelText(/视频名称/);
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("必填")).toBeTruthy();
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(name);
    });
  });

  it("a name made only of invisible characters is treated as empty", async () => {
    const { user, onSubmit } = setup({ initial: { ...EMPTY_VIDEO_FORM, label: "\u200b" } });
    await user.type(screen.getByLabelText("链接(可选)"), "https://example.com/v");
    await user.click(screen.getByRole("button", { name: "保存视频记录" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("必填")).toBeTruthy();
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText(/视频名称/));
    });
  });

  it.each([
    ["not a link", "example.com/video"],
    ["javascript link", "javascript:alert(1)"],
    ["ftp link", "ftp://example.com/x"],
    ["link with a space", "https://example.com/a b"],
  ])("rejects %s with the link message", async (_name, value) => {
    const { user, onSubmit } = setup();
    await user.type(screen.getByLabelText(/视频名称/), "x");
    await user.type(screen.getByLabelText("链接(可选)"), value);
    await user.click(screen.getByRole("button", { name: "保存视频记录" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("链接需要以 http:// 或 https:// 开头,且不能含空格")).toBeTruthy();
  });

  it("rejects a link that carries a user name or password", async () => {
    const { user, onSubmit } = setup();
    await user.type(screen.getByLabelText(/视频名称/), "x");
    await user.type(screen.getByLabelText("链接(可选)"), "https://coach:secret@example.com/v");
    await user.click(screen.getByRole("button", { name: "保存视频记录" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("链接里不能包含用户名或密码")).toBeTruthy();
  });

  it("rejects an over-long name", async () => {
    const { user, onSubmit } = setup({ initial: { ...EMPTY_VIDEO_FORM, label: "x".repeat(121) } });
    await user.click(screen.getByRole("button", { name: "保存视频记录" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("内容太长,请缩短")).toBeTruthy();
  });

  it("while saving disables the fields and buttons and does not submit again", async () => {
    const { user, onSubmit } = setup({ saving: true, initial: { ...EMPTY_VIDEO_FORM, label: "x" } });
    expect((screen.getByLabelText(/视频名称/) as HTMLInputElement).disabled).toBe(true);
    const saveButton = screen.getByRole("button", { name: "保存中…" }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    await user.click(saveButton);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows a save error from the page", () => {
    setup({ submitErrorKey: "raceDay.error.saveNetwork" });
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("editing: says race and athlete are fixed, focuses the form and titles it as an edit", () => {
    setup({ editing: true, focusOnMount: true, initial: { ...EMPTY_VIDEO_FORM, label: "Final" } });
    expect(screen.getByRole("form", { name: "编辑视频记录" })).toBeTruthy();
    expect(screen.getByText(/编辑时不能更改比赛和运动员/)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText(/视频名称/));
    expect((screen.getByLabelText(/视频名称/) as HTMLInputElement).value).toBe("Final");
  });

  it("cancel calls onCancel", async () => {
    const { user, onCancel } = setup();
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("English locale", () => {
    locale.current = "en";
    setup();
    expect(screen.getByLabelText(/Video name/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save video record" })).toBeTruthy();
    locale.current = "zh";
  });
});
