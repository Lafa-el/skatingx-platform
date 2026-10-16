// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { renderHook } from "@/test/dom";

import { useIsPro } from "./useIsPro";

const settings = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock("@/app/providers/FirestoreProvider", () => ({
  useUserSettings: () => ({ data: settings.value, loading: false, error: null }),
}));

const languageFor = (value: unknown) => {
  settings.value = value === undefined ? undefined : { language: value };
  return renderHook(() => useIsPro()).result.current.language;
};

describe("useIsPro language", () => {
  it("is English only for the stored value \"en\"", () => {
    expect(languageFor("en")).toBe("en");
  });

  it("is Chinese for \"zh\", for settings that are not loaded, and for anything unexpected", () => {
    expect(languageFor("zh")).toBe("zh");
    expect(languageFor(undefined)).toBe("zh");
    expect(languageFor("fr")).toBe("zh");
    expect(languageFor(null)).toBe("zh");
    expect(languageFor("EN")).toBe("zh");
  });

  it("the Pro flag still needs exactly true", () => {
    settings.value = { isPro: "true" };
    expect(renderHook(() => useIsPro()).result.current.isPro).toBe(false);
    settings.value = { isPro: true };
    expect(renderHook(() => useIsPro()).result.current.isPro).toBe(true);
  });
});
