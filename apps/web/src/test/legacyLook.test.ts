// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { legacyColourClasses } from "./legacyLook";

const html = (markup: string) => {
  const root = document.createElement("div");
  root.innerHTML = markup;
  return root;
};

describe("legacyColourClasses", () => {
  it("finds the old colour classes, including with a variant prefix", () => {
    const root = html(
      '<p class="text-slate-500 mt-2"></p><a class="hover:text-sky-700"></a><p class="border-red-200 bg-red-50"></p><b class="text-white"></b>',
    );
    expect(legacyColourClasses(root)).toEqual(["bg-red-50", "border-red-200", "hover:text-sky-700", "text-slate-500", "text-white"]);
  });

  it("lets the new brand colours and layout classes through", () => {
    const root = html('<p class="text-brand-navy/70 bg-brand-ice border-status-danger/30 mt-2 text-sm"></p>');
    expect(legacyColourClasses(root)).toEqual([]);
  });
});
