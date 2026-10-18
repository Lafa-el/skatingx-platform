import type { ReactNode } from "react";

import { StatusGlyph } from "./StatusGlyph";

type ErrorNoticeProps = {
  children: ReactNode;
  className?: string;
};

/**
 * An error shown on the page. Icon and words together, never colour alone (UI v1 rule), in the
 * error red, which is a different hue from the brand flame so the two are not mistaken.
 */
export function ErrorNotice({ children, className = "" }: ErrorNoticeProps) {
  return (
    <p
      role="alert"
      className={`flex items-start gap-2 break-words rounded-control border border-status-danger/30 bg-status-danger-tint px-3 py-2 text-sm text-status-danger ${className}`.trim()}
    >
      <StatusGlyph tone="danger" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
