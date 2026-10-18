/**
 * For a page that has moved to UI v1: every old colour class still rendered on it, so a test can
 * assert the list is empty. The old blue, grey, red, green and amber classes are what the page was
 * styled with before; on the warm-white page colour the small grey ones are also under 4.5:1.
 */
const OLD_COLOUR =
  /(^|:)(text|bg|border|ring|accent|outline|divide|placeholder|from|to)-(sky|slate|gray|red|emerald|green|amber|blue)-\d/;

export function legacyColourClasses(root: ParentNode): string[] {
  const found = new Set<string>();
  for (const el of root.querySelectorAll("[class]")) {
    for (const name of (el.getAttribute("class") ?? "").split(/\s+/)) {
      if (OLD_COLOUR.test(name) || name === "text-white" || name === "bg-white/95") found.add(name);
    }
  }
  return [...found].sort();
}
