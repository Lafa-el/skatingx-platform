import { checkExternalUrl, externalUrlHost, type RaceVideoLink } from "@skatingx/skating-domain";
import { StatusTag } from "@skatingx/ui";
import type { ReactNode } from "react";

import { useRaceVideoContext } from "@/hooks/useRaceVideoContext";
import { useLocale } from "@/hooks/useLocale";
import { tAnalysis, type AnalysisMessageKey } from "@/shared/i18n/analysis-messages";

/**
 * Read-only context for a video the user came from in Race Day (ADR-010). It reads three small
 * lists and writes nothing; it touches no video bytes and shares no state with the analysis below.
 * It is loaded lazily, only after the flag, PRO and id-format gates have passed.
 *
 * Nothing is shown until all three records are found: no placeholder, no error. The page below
 * works the same with or without it.
 */
export default function RaceVideoBanner({ link }: { link: RaceVideoLink }) {
  const locale = useLocale();
  const context = useRaceVideoContext(link);
  if (!context) return null;

  const field = (key: AnalysisMessageKey) => tAnalysis(locale, key);
  const pending = <StatusTag tone="pending">{field("analysis.raceVideo.pending")}</StatusTag>;

  return (
    <section
      aria-labelledby="race-video-banner-title"
      className="rounded-card border border-brand-navy/15 bg-brand-ice p-4 shadow-card"
    >
      <h2 id="race-video-banner-title" className="text-base font-semibold text-brand-navy">
        {field("analysis.raceVideo.title")}
      </h2>
      <dl className="mt-3 grid items-center gap-2 text-sm text-brand-navy sm:grid-cols-[max-content_1fr] sm:gap-x-4">
        <Row label={field("analysis.raceVideo.field.event")}>
          <span className="break-words">{context.eventName}</span>
          {context.eventPending ? pending : null}
        </Row>
        <Row label={field("analysis.raceVideo.field.race")}>
          <span className="break-words">{context.raceLabel}</span>
          {context.racePending ? pending : null}
        </Row>
        <Row label={field("analysis.raceVideo.field.video")}>
          <span className="break-words">{context.videoLabel}</span>
        </Row>
        {context.storedWhere ? (
          <Row label={field("analysis.raceVideo.field.storedWhere")}>
            <span className="break-words">{context.storedWhere}</span>
          </Row>
        ) : null}
        {context.externalUrl !== null ? (
          <Row label={field("analysis.raceVideo.field.link")}>
            <ExternalLink value={context.externalUrl} />
          </Row>
        ) : null}
      </dl>
      <p className="mt-3 text-sm text-brand-navy/70">{field("analysis.raceVideo.hint")}</p>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="font-semibold text-brand-navy/70">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-2">{children}</dd>
    </>
  );
}

/**
 * Only a plain http(s) link without credentials becomes a link, by the same check the video page
 * uses. Anything else is text, and a link with credentials is never echoed.
 */
function ExternalLink({ value }: { value: string }) {
  const locale = useLocale();
  const check = checkExternalUrl(value);
  const host = check === "ok" ? externalUrlHost(value) : null;

  if (check === "ok" && host !== null) {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center font-semibold text-brand-navy underline underline-offset-2"
      >
        {tAnalysis(locale, "analysis.raceVideo.link.open", { host })}
      </a>
    );
  }
  // A non-web string such as `ftp://user:pw@host` is not parsed as http(s), so it is caught here.
  if (check === "urlHasCredentials" || /\/\/[^/\s]*@/.test(value)) {
    return <span>{tAnalysis(locale, "analysis.raceVideo.link.credentials")}</span>;
  }
  return <span className="break-all">{tAnalysis(locale, "analysis.raceVideo.link.notWeb", { text: value })}</span>;
}
