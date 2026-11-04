// @vitest-environment happy-dom
import { fireEvent } from "@testing-library/react";
import type { AthleteProfile } from "@skatingx/schema";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen, userEvent, waitFor } from "@/test/dom";

import { AthleteProfileForm } from "./AthleteProfileForm";

const h = vi.hoisted(() => ({
  upload: vi.fn(async (..._args: unknown[]) => "avatars/uid-1/athlete-1/avatar"),
  remove: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock("@skatingx/firebase-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@skatingx/firebase-client")>();
  return {
    ...actual,
    getFirestoreDb: () => ({}),
    getFirebaseStorage: () => ({}),
    uploadAthleteAvatar: (...args: unknown[]) => h.upload(...args),
    deleteAthleteAvatar: (...args: unknown[]) => h.remove(...args),
  };
});
vi.mock("@/hooks/useAthletePhotoUrl", () => ({
  useAthletePhotoUrl: (path: string | null) => (path ? "https://example.test/avatar.png" : null),
}));

const profile = {
  athleteId: "athlete-1",
  displayName: "Lindsay",
  birthDate: "2015-01-14",
  sport: "short_track_speed_skating",
  country: "USA",
  avatarStoragePath: "avatars/uid-1/athlete-1/avatar",
} as AthleteProfile;

function renderEdit(next: AthleteProfile = profile) {
  render(
    <AthleteProfileForm
      profile={next}
      userId="uid-1"
      athleteId="athlete-1"
      locale="zh"
      onCancel={() => undefined}
      onSaved={() => undefined}
    />,
  );
}

afterEach(() => {
  h.upload.mockClear();
  h.remove.mockClear();
});

describe("athlete photo on the edit form", () => {
  it("is not shown while creating an athlete", () => {
    render(
      <AthleteProfileForm
        userId="uid-1"
        locale="zh"
        onCancel={() => undefined}
        onSaved={() => undefined}
      />,
    );
    expect(screen.queryByRole("button", { name: "上传头像" })).toBeNull();
    expect(screen.queryByRole("button", { name: "删除头像" })).toBeNull();
  });

  it("shows the current photo and does not upload a file that fails the check", async () => {
    renderEdit();
    expect(document.querySelector("img")?.getAttribute("src")).toBe("https://example.test/avatar.png");
    const input = screen.getByLabelText("更换头像") as HTMLInputElement;
    choose(input, new File(["hello"], "note.txt", { type: "text/plain" }));
    expect(screen.getByText("请选择图片。")).toBeTruthy();
    expect(h.upload).not.toHaveBeenCalled();

    const tooBig = new File([new Uint8Array(8)], "big.png", { type: "image/png" });
    Object.defineProperty(tooBig, "size", { value: 5 * 1024 * 1024 });
    choose(input, tooBig);
    expect(screen.getByText("图片必须小于 5MB。")).toBeTruthy();
    expect(h.upload).not.toHaveBeenCalled();
  });

  it("uploads a small image and can remove the photo", async () => {
    renderEdit({ ...profile, avatarStoragePath: undefined });
    const user = userEvent.setup();
    const input = screen.getByLabelText("上传头像") as HTMLInputElement;
    choose(input, new File(["png"], "face.png", { type: "image/png" }));
    await waitFor(() => expect(h.upload).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "删除头像" }));
    expect(h.remove).toHaveBeenCalledWith({}, {}, "uid-1", "athlete-1");
  });
});

function choose(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  fireEvent.change(input);
}
