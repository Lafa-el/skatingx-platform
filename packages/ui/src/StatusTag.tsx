import type { ReactNode } from "react";

export type StatusTone = "pending" | "success" | "danger" | "neutral" | "brand";

type StatusTagProps = {
  tone: StatusTone;
  /** The status in words. A tag is never colour alone, so there is no way to leave this out. */
  children: ReactNode;
  className?: string;
};

// Each tone has its own glyph shape as well as its own colour, so the status can be told apart
// without seeing colour (an error and a "to be confirmed" tag are both warm).
const glyphs: Record<StatusTone, ReactNode> = {
  success: <path d="M2.5 6.5 5 9l4.5-5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  pending: (
    <>
      <circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 3.4V6l1.8 1.1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  danger: (
    <>
      <path d="M6 1.6 11 10.4H1Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6 5v2.2M6 8.8v.01" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  neutral: <circle cx="6" cy="6" r="2.4" fill="currentColor" />,
  brand: <circle cx="6" cy="6" r="2.4" fill="currentColor" />,
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
      <svg aria-hidden="true" focusable="false" viewBox="0 0 12 12" className="size-3 shrink-0">
        {glyphs[tone]}
      </svg>
      {children}
    </span>
  );
}
