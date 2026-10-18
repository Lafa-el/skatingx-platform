import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

type ScrollRowProps = {
  /** The element that scrolls: a navigation landmark for tab bars, a plain row for button groups. */
  as?: "div" | "nav";
  "aria-label"?: string;
  /** Classes for the outer box (background, border, spacing outside the row). */
  className?: string;
  /** Classes for the scrolling row itself (layout, gap, padding). */
  rowClassName?: string;
  /** The edge fades must match the colour behind the row, or they show as a stripe. */
  fadeFrom: "white" | "ice";
  children: ReactNode;
};

// Plain CSS gradients rather than Tailwind's gradient utilities, which add about 1.5 kB of
// registered custom properties to the style sheet for two small strips.
const FADE_COLOUR = { white: "#ffffff", ice: "var(--color-brand-ice)" } as const;

// What marks the current item: a tab link or a pressed toggle button.
const CURRENT = '[aria-current="page"], [aria-pressed="true"]';

/**
 * A row that scrolls sideways. On a phone the scroll bar is not drawn, so nothing else says there
 * is more: a fade at an edge shows that something is hidden that way, and
 * the current item is brought into view when the row appears or the selection changes.
 * Nothing changes when the row fits.
 */
export function ScrollRow({
  as: Tag = "div",
  className = "",
  rowClassName = "",
  fadeFrom,
  children,
  ...rest
}: ScrollRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const shownRef = useRef<Element | null>(null);
  const [more, setMore] = useState({ before: false, after: false });

  const measure = useCallback(() => {
    const row = rowRef.current;
    if (!row) {
      return;
    }
    const before = row.scrollLeft > 1;
    const after = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
    // Same values again: no state change, so no extra render while scrolling.
    setMore((current) => (current.before === before && current.after === after ? current : { before, after }));
  }, []);

  // After every render, because the selection (and so the current item) can change without the row
  // being replaced. It only moves the row when the current item is not the one already shown.
  useLayoutEffect(() => {
    const row = rowRef.current;
    const current = row?.querySelector<HTMLElement>(CURRENT) ?? null;
    if (row && current && current !== shownRef.current) {
      // Centre it; assigning scrollLeft clamps at both ends. Not scrollIntoView, which can also
      // scroll the whole page.
      row.scrollLeft = current.offsetLeft - (row.clientWidth - current.offsetWidth) / 2;
    }
    shownRef.current = current;
    measure();
  });

  useEffect(() => {
    window.addEventListener("resize", measure);
    const row = rowRef.current;
    const observer = typeof ResizeObserver === "undefined" || !row ? null : new ResizeObserver(measure);
    if (row && observer) {
      observer.observe(row);
    }
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [measure]);

  const fade = "pointer-events-none absolute inset-y-0 z-10 w-8";
  const colour = FADE_COLOUR[fadeFrom];

  return (
    <div className={`relative ${className}`.trim()}>
      <Tag
        ref={rowRef}
        onScroll={measure}
        // The bar is only hidden below lg: a phone has none to draw, while a desktop mouse still needs
        // one to reach what is cut off (the fade says there is more, the bar lets you get to it).
        className={`max-lg:sx-no-scrollbar relative overflow-x-auto ${rowClassName}`.trim()}
        {...rest}
      >
        {children}
      </Tag>
      {more.before ? (
        <span
          aria-hidden="true"
          data-fade="before"
          className={`${fade} left-0`}
          style={{ backgroundImage: `linear-gradient(to right, ${colour}, transparent)` }}
        />
      ) : null}
      {more.after ? (
        <span
          aria-hidden="true"
          data-fade="after"
          className={`${fade} right-0`}
          style={{ backgroundImage: `linear-gradient(to left, ${colour}, transparent)` }}
        />
      ) : null}
    </div>
  );
}
