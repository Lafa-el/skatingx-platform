import type { ReactNode } from "react";

import { StatusGlyph, type StatusTone } from "./StatusGlyph";

export type { StatusTone } from "./StatusGlyph";

type StatusTagProps = {
  tone: StatusTone;
  /** The status in words. A tag is never colour alone, so there is no way to leave this out. */
  children: ReactNode;
  className?: string;
};

// Text is navy on every tone except danger, where the text is the error red itself (5.08:1 on its tint).
const tones: Record<StatusTone, string> = {
  pending: "bg-status-pending-tint text-brand-navy",
  success: "bg-status-success-tint text-brand-navy [&>svg]:text-status-success",
  danger: "bg-status-danger-tint text-status-danger",
  neutral: "border border-brand-navy/15 bg-white text-brand-navy",
  brand: "bg-brand-flame text-brand-navy",
};

export function StatusTag({ tone, children, className = "" }: StatusTagProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]} ${className}`.trim()}
      data-tone={tone}
    >
      <StatusGlyph tone={tone} />
      {children}
    </span>
  );
}
