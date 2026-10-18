import type { ReactNode } from "react";

import { StatusGlyph } from "./StatusGlyph";

type NoticeTone = "info" | "success" | "pending";

type NoticeProps = {
  tone: NoticeTone;
  /** Bold first line, for notices that have a heading and a body. */
  title?: string;
  children: ReactNode;
  /** `status` for a notice that appears after an action, so screen readers announce it. */
  role?: "status";
  className?: string;
};

// Text is navy on every tone: the tints are light, so navy is far above 4.5:1, and the glyph
// (a different shape per tone) says what kind of notice it is without relying on colour.
const tones = {
  info: { box: "border-brand-navy/15 bg-white", glyph: "neutral", glyphColour: "text-brand-navy" },
  success: { box: "border-status-success/30 bg-status-success-tint", glyph: "success", glyphColour: "text-status-success" },
  pending: { box: "border-brand-navy/15 bg-status-pending-tint", glyph: "pending", glyphColour: "text-brand-navy" },
} as const;

/** A non-error message on the page (errors use `ErrorNotice`). */
export function Notice({ tone, title, children, role, className = "" }: NoticeProps) {
  const look = tones[tone];
  return (
    <div
      role={role}
      className={`flex items-start gap-2 break-words rounded-control border px-3 py-2 text-sm text-brand-navy ${look.box} ${className}`.trim()}
    >
      <StatusGlyph tone={look.glyph} className={`mt-0.5 size-4 shrink-0 ${look.glyphColour}`} />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={title ? "mt-1" : ""}>{children}</div>
      </div>
    </div>
  );
}
