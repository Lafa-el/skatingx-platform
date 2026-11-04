// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatSkatingDuration,
  getAgeCategory,
  getRealAge,
  getSkatingAge,
  getSkatingDuration,
  todayDateString,
} from "@skatingx/skating-domain";

import { legacyColourClasses } from "@/test/legacyLook";
import { render, screen, userEvent, waitFor } from "@/test/dom";

import { AthletePage } from "./AthletePage";

type Hook = { data: unknown; loading: boolean; error: string | null };

const h = vi.hoisted(() => {
  const ready = (data: unknown): Hook => ({ data, loading: false, error: null });
  const base = () => ({
    locale: "zh" as "zh" | "en",
    active: { athleteId: "athlete-1", loading: false, error: null as string | null },
    profile: ready({
      displayName: "Sample Skater",
      birthDate: "2015-01-14",
      sport: "short_track_speed_skating",
      country: "USA",
    }),
    settings: ready({ activeAthleteId: "athlete-1" }),
  });
  return { ready, base, state: base(), updateAthleteProfile: vi.fn() };
});

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => h.state.locale }));
vi.mock("@/app/providers/AuthProvider", () => ({ useAuth: () => ({ uid: "uid-123" }) }));
vi.mock("@/hooks/firestore", () => ({
  useActiveAthlete: () => h.state.active,
  useAthleteProfile: () => h.state.profile,
  useUserSettings: () => h.state.settings,
}));
vi.mock("@/components/AthleteSelector", () => ({ AthleteSelector: () => null }));
vi.mock("@/components/FirestoreStatusBanner", () => ({ FirestoreStatusBanner: () => null }));
vi.mock("@skatingx/firebase-client", () => ({
  getFirestoreDb: () => ({}),
  updateAthleteProfile: h.updateAthleteProfile,
}));

afterEach(() => {
  h.state = h.base();
  h.updateAthleteProfile.mockReset();
});

const term = (name: string) =>
  screen.getAllByText(name).find((node) => node.tagName === "DT")?.closest("div")?.querySelector("dd")?.textContent;

describe("AthletePage", () => {
  it("Chinese: title, note and every label", () => {
    render(<AthletePage />);
    expect(screen.getByRole("heading", { level: 1, name: "运动员" })).toBeTruthy();
    expect(screen.getByText("已从数据服务加载当前运动员的档案。")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "当前档案" })).toBeTruthy();
    for (const label of ["姓名", "出生日期", "项目", "国家/地区", "当前运动员 ID", "账户 UID", "年龄", "冰龄", "年龄组", "滑冰时长"]) {
      expect(screen.getByText(label), label).toBeTruthy();
    }
  });

  it("English: the previous wording, which still names Firestore", () => {
    h.state.locale = "en";
    render(<AthletePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Athlete" })).toBeTruthy();
    expect(screen.getByText("Profile loaded from Firestore for the active skater.")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Active profile" })).toBeTruthy();
    for (const label of ["Name", "Birth date", "Sport", "Country", "Active athlete ID", "Account UID", "Age", "Skating Age", "Age Category", "Skating duration"]) {
      expect(screen.getByText(label), label).toBeTruthy();
    }
  });

  it("Chinese note does not show the product name", () => {
    render(<AthletePage />);
    expect(screen.queryByText(/Firestore/)).toBeNull();
  });

  it("shows the stored values as they are, and the birth date as a calendar date in the language", () => {
    render(<AthletePage />);
    expect(term("姓名")).toBe("Sample Skater");
    expect(term("出生日期")).toBe("2015年1月14日");
    expect(term("项目")).toBe("短道速滑");
    expect(term("国家/地区")).toBe("USA");
    expect(term("当前运动员 ID")).toBe("athlete-1");
    expect(term("账户 UID")).toBe("uid-123");
  });

  it("English shows the sport as a readable name, not the stored identifier", () => {
    h.state.locale = "en";
    render(<AthletePage />);
    expect(term("Sport")).toBe("Short track speed skating");
  });

  it("a sport value we have no name for is shown as stored, never hidden or guessed", () => {
    h.state.profile = h.ready({ displayName: "X", birthDate: "2015-01-14", sport: "curling", country: "c" });
    render(<AthletePage />);
    expect(term("项目")).toBe("curling");
  });

  it("a sport value that is also an object property name is not mistaken for a known sport", () => {
    h.state.profile = h.ready({ displayName: "X", birthDate: "2015-01-14", sport: "constructor", country: "c" });
    render(<AthletePage />);
    expect(term("项目")).toBe("constructor");
  });

  it("English birth date", () => {
    h.state.locale = "en";
    render(<AthletePage />);
    expect(term("Birth date")).toBe("Jan 14, 2015");
  });

  it("a birth date that is not a calendar day is shown as stored", () => {
    h.state.profile = h.ready({ displayName: "X", birthDate: "unknown", sport: "s", country: "c" });
    render(<AthletePage />);
    expect(term("出生日期")).toBe("unknown");
  });

  it("adds age, skating age, category and duration; a missing start date leaves only the duration blank", () => {
    const today = todayDateString();
    render(<AthletePage />);
    const skatingAge = getSkatingAge("2015-01-14", today);
    expect(term("年龄")).toBe(String(getRealAge("2015-01-14", today)));
    expect(term("冰龄")).toBe(String(skatingAge));
    expect(term("年龄组")).toBe(getAgeCategory(skatingAge ?? Number.NaN));
    expect(term("滑冰时长")).toBe("—");
  });

  it("without a birth date the first three lines are dashes, and a start date still fills the duration", () => {
    const today = todayDateString();
    h.state.profile = h.ready({
      displayName: "X",
      sport: "s",
      country: "c",
      skatingStartDate: "2021-05-12",
    });
    render(<AthletePage />);
    expect(term("年龄")).toBe("—");
    expect(term("冰龄")).toBe("—");
    expect(term("年龄组")).toBe("—");
    const duration = getSkatingDuration("2021-05-12", today);
    expect(duration).not.toBeNull();
    expect(term("滑冰时长")).toBe(formatSkatingDuration(duration!, "zh"));
  });

  it("while the profile is loading the four lines stay on the ellipsis", () => {
    h.state.profile = { data: { displayName: "X", birthDate: "2015-01-14", skatingStartDate: "2021-05-12" }, loading: true, error: null };
    render(<AthletePage />);
    for (const label of ["年龄", "冰龄", "年龄组", "滑冰时长"]) {
      expect(term(label)).toBe("…");
    }
  });

  it("a missing birth date shows a dash, not an empty cell", () => {
    h.state.profile = h.ready({ displayName: "X", sport: "s", country: "c" });
    render(<AthletePage />);
    expect(term("出生日期")).toBe("—");
  });

  it("missing values show a dash, and loading shows an ellipsis", () => {
    h.state.profile = h.ready(null);
    const first = render(<AthletePage />);
    expect(term("姓名")).toBe("—");
    first.unmount();

    h.state.profile = { data: null, loading: true, error: null };
    render(<AthletePage />);
    expect(term("姓名")).toBe("…");
  });

  it("shows an error from the data layer as an alert, as received", () => {
    h.state.active = { athleteId: "athlete-1", loading: false, error: "Some technical reason" };
    render(<AthletePage />);
    expect(screen.getByRole("alert").textContent).toBe("Some technical reason");
  });

  it("is in the UI v1 look: no old colour classes in any state, navy heading, the error has an icon", () => {
    const ok = render(<AthletePage />);
    expect(legacyColourClasses(ok.container)).toEqual([]);
    expect(screen.getByRole("heading", { level: 1 }).className).toContain("text-brand-navy");
    ok.unmount();
    h.state.profile = { data: null, loading: true, error: null };
    const loading = render(<AthletePage />);
    expect(legacyColourClasses(loading.container)).toEqual([]);
    loading.unmount();
    h.state.active = { athleteId: "athlete-1", loading: false, error: "Some technical reason" };
    const failed = render(<AthletePage />);
    expect(legacyColourClasses(failed.container)).toEqual([]);
    expect(screen.getByRole("alert").querySelector("svg")).not.toBeNull();
  });

  it("the profile card is the raised card and its small labels are the navy tint", () => {
    const view = render(<AthletePage />);
    expect(view.container.querySelector("article")?.className).toContain("rounded-card");
    expect(view.container.querySelector("dt")?.className).toContain("text-brand-navy/70");
  });

  it("hides edit while the profile is loading, after a read failure, or when there is no profile", () => {
    h.state.profile = { data: h.base().profile.data, loading: true, error: null };
    const loading = render(<AthletePage />);
    expect(screen.queryByRole("button", { name: "编辑" })).toBeNull();
    loading.unmount();

    h.state.profile = { data: h.base().profile.data, loading: false, error: "read failed" };
    const failed = render(<AthletePage />);
    expect(screen.queryByRole("button", { name: "编辑" })).toBeNull();
    failed.unmount();

    h.state.profile = h.ready(null);
    render(<AthletePage />);
    expect(screen.queryByRole("button", { name: "编辑" })).toBeNull();
  });

  it("opens a form prefilled from the profile, with an empty bio and start date left blank", async () => {
    const user = userEvent.setup();
    render(<AthletePage />);
    await user.click(screen.getByRole("button", { name: "编辑" }));
    expect(input("姓名").value).toBe("Sample Skater");
    expect(input("出生日期").value).toBe("2015-01-14");
    expect(input("开始滑冰日期").value).toBe("");
    expect(textArea("个人简介").value).toBe("");
    expect(input("国家/地区").value).toBe("USA");
    expect((screen.getByLabelText("项目") as HTMLSelectElement).value).toBe("short_track_speed_skating");
    expect(screen.getByText("0/500")).toBeTruthy();
    expect(term("姓名")).toBe("Sample Skater");
  });

  it("prefills a stored bio and start date", async () => {
    h.state.profile = h.ready({
      displayName: "Sample Skater",
      birthDate: "2015-01-14",
      skatingStartDate: "2021-05-12",
      sport: "short_track_speed_skating",
      country: "USA",
      bio: "ice notes",
    });
    const user = userEvent.setup();
    render(<AthletePage />);
    await user.click(screen.getByRole("button", { name: "编辑" }));
    expect(input("开始滑冰日期").value).toBe("2021-05-12");
    expect(textArea("个人简介").value).toBe("ice notes");
    expect(screen.getByText("9/500")).toBeTruthy();
  });

  it("saves only the form fields and closes the form", async () => {
    const user = userEvent.setup();
    render(<AthletePage />);
    await user.click(screen.getByRole("button", { name: "编辑" }));
    await user.clear(input("姓名"));
    await user.type(input("姓名"), "Lindsay Lin");
    await user.type(textArea("个人简介"), "starts");
    setControl(input("开始滑冰日期"), "2021-05-12");
    expect(term("姓名")).toBe("Sample Skater");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(h.updateAthleteProfile).toHaveBeenCalledTimes(1));
    expect(h.updateAthleteProfile).toHaveBeenCalledWith({}, "uid-123", "athlete-1", {
      displayName: "Lindsay Lin",
      birthDate: "2015-01-14",
      skatingStartDate: "2021-05-12",
      sport: "short_track_speed_skating",
      country: "USA",
      bio: "starts",
    });
    expect(Object.keys(h.updateAthleteProfile.mock.calls[0][3]).sort()).toEqual([
      "bio",
      "birthDate",
      "country",
      "displayName",
      "skatingStartDate",
      "sport",
    ]);
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
    expect(screen.getByRole("button", { name: "编辑" })).toBeTruthy();
  });

  it("blocks an empty name, an empty country, and a bio over 500 characters", async () => {
    const user = userEvent.setup();
    render(<AthletePage />);
    await user.click(screen.getByRole("button", { name: "编辑" }));

    await user.clear(input("姓名"));
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByText("请填写姓名。")).toBeTruthy();
    expect(h.updateAthleteProfile).not.toHaveBeenCalled();

    await user.type(input("姓名"), "Lindsay");
    await user.clear(input("国家/地区"));
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByText("请填写国家或地区。")).toBeTruthy();
    expect(h.updateAthleteProfile).not.toHaveBeenCalled();

    await user.type(input("国家/地区"), "USA");
    setControl(textArea("个人简介"), "a".repeat(501));
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByText("简介不能超过 500 个字。")).toBeTruthy();
    expect(screen.getByText("501/500")).toBeTruthy();
    expect(h.updateAthleteProfile).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "保存" })).toBeTruthy();
  });

  it("blocks a birth date that is not a real day", async () => {
    h.state.profile = h.ready({
      displayName: "Sample Skater",
      birthDate: "2026-02-30",
      sport: "short_track_speed_skating",
      country: "USA",
    });
    const user = userEvent.setup();
    render(<AthletePage />);
    await user.click(screen.getByRole("button", { name: "编辑" }));
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByText("请填写真实日期。")).toBeTruthy();
    expect(h.updateAthleteProfile).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "保存" })).toBeTruthy();
  });

  it("blocks a start date that is not a real day", async () => {
    h.state.profile = h.ready({
      displayName: "Sample Skater",
      birthDate: "2015-01-14",
      skatingStartDate: "2026-02-30",
      sport: "short_track_speed_skating",
      country: "USA",
    });
    const user = userEvent.setup();
    render(<AthletePage />);
    await user.click(screen.getByRole("button", { name: "编辑" }));
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByText("请填写真实日期。")).toBeTruthy();
    expect(h.updateAthleteProfile).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "保存" })).toBeTruthy();
  });

  it("cancel closes the form and does not write", async () => {
    const user = userEvent.setup();
    render(<AthletePage />);
    await user.click(screen.getByRole("button", { name: "编辑" }));
    await user.clear(input("姓名"));
    await user.type(input("姓名"), "Changed");
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(h.updateAthleteProfile).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
    expect(term("姓名")).toBe("Sample Skater");
  });

  it("keeps the form and shows an error when the write fails", async () => {
    h.updateAthleteProfile.mockRejectedValueOnce(new Error("unavailable"));
    const user = userEvent.setup();
    render(<AthletePage />);
    await user.click(screen.getByRole("button", { name: "编辑" }));
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("没能保存，请再试一次。"));
    expect(input("姓名").value).toBe("Sample Skater");
    expect(screen.getByRole("button", { name: "保存" })).toBeTruthy();
  });

  it("English form labels", async () => {
    h.state.locale = "en";
    const user = userEvent.setup();
    render(<AthletePage />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Name")).toBeTruthy();
    expect(screen.getByLabelText("Birth date")).toBeTruthy();
    expect(screen.getByLabelText("Skating start date")).toBeTruthy();
    expect(screen.getByLabelText("Sport")).toBeTruthy();
    expect(screen.getByLabelText("Country")).toBeTruthy();
    expect(screen.getByLabelText("Bio")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });
});

function input(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function textArea(label: string): HTMLTextAreaElement {
  return screen.getByLabelText(label) as HTMLTextAreaElement;
}

function setControl(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}
