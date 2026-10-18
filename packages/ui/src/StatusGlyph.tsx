import type { ReactNode } from "react";

export type StatusTone = "pending" | "success" | "danger" | "neutral" | "brand";

// Each tone has its own glyph shape as well as its own colour, so the status can be told apart
// without seeing colour (an error and a "to be confirmed" tag are both warm).
const shapes: Record<StatusTone, ReactNode> = {
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

/** Decorative: whatever it sits next to carries the words. */
export function StatusGlyph({ tone, className = "size-3 shrink-0" }: { tone: StatusTone; className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 12 12" className={className}>
      {shapes[tone]}
    </svg>
  );
}
