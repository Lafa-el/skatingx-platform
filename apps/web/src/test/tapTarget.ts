/**
 * The happy-dom tests have no layout, so a tap target cannot be measured. What they can check is
 * that a control asks for the size: `min-h-11` is 44px, the smallest touch target we accept.
 * The real size was measured in a browser at 320 and 375px (see the PR that introduced this).
 */
const TOKEN = "min-h-11";
const WIDE_TOKEN = "min-w-11";

const classesOf = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);

const describeEl = (el: Element) => `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}"`;

type Options = {
  /** Links that are whole cards are large already; pages made of them skip the links. */
  skipLinks?: boolean;
  /** Controls whose label is a short word or an icon also need the width (Edit, Delete). */
  wide?: (el: Element) => boolean;
};

/** Every control under `root` that does not ask for a 44px target. Empty means all do. */
export function controlsBelowTapTarget(root: ParentNode, options: Options = {}): string[] {
  const selector = ["button", "select", "textarea", "input", options.skipLinks ? "" : "a[href]"]
    .filter(Boolean)
    .join(",");
  const below: string[] = [];
  for (const el of root.querySelectorAll(selector)) {
    const isChoice = el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio");
    // A check box or radio is small by nature; its label is what the finger hits.
    const target = isChoice ? el.closest("label") : el;
    if (!target || !classesOf(target).includes(TOKEN)) {
      below.push(describeEl(el));
      continue;
    }
    if ((options.wide?.(el) ?? false) && !classesOf(target).includes(WIDE_TOKEN)) {
      below.push(`${describeEl(el)} (width)`);
    }
  }
  return below;
}
