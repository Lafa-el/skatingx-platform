import type { RaceDayVerification } from "@skatingx/schema";
import { StatusTag } from "@skatingx/ui";

import { useLocale } from "@/hooks/useLocale";

import { t } from "../i18n/messages";

/**
 * The "待确认" marker (ADR-001 D5, AGENTS.md "unverified data must be marked"). It is text and a
 * different icon shape, not only a color, so it is readable without color vision and by screen
 * readers. Anything that is not exactly "verified" renders as pending: unknown must never look confirmed.
 */
export function VerificationBadge({ verification }: { verification: RaceDayVerification }) {
  const locale = useLocale();
  const state: RaceDayVerification = verification === "verified" ? "verified" : "pending";

  return (
    <StatusTag tone={state === "verified" ? "success" : "pending"} data-verification={state}>
      {t(locale, state === "verified" ? "raceDay.verification.verified" : "raceDay.verification.pending")}
    </StatusTag>
  );
}
