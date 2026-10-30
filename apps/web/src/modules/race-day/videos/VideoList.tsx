import { raceVideoAnalysisHref } from "@skatingx/skating-domain";
import { useState } from "react";
import { Link } from "react-router-dom";

import { useLocale } from "@/hooks/useLocale";

import { DANGER_BUTTON, FormMessage, SECONDARY_BUTTON } from "../components/fields";
import { t } from "../i18n/messages";
import { raceOptionLabel } from "../lib/schedule";
import type { VideoGroup, VideoView } from "../lib/videos";

type VideoListProps = {
  eventId: string;
  groups: readonly VideoGroup[];
  busy: boolean;
  onEdit: (view: VideoView) => void;
  onDelete: (view: VideoView) => void;
};

/** Records grouped by race. Links open in a new tab, and the list shows only the host. */
export function VideoList({ eventId, groups, busy, onEdit, onDelete }: VideoListProps) {
  const locale = useLocale();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      {groups.map((group) => {
        const raceName = group.race
          ? raceOptionLabel(group.race, group.raceNumber, locale)
          : t(locale, "raceDay.videos.item.unknownRace");
        const headingId = `video-group-${group.race?.raceId ?? "unknown"}`;

        return (
          <section key={group.race?.raceId ?? "unknown"} aria-labelledby={headingId} className="space-y-2">
            <h3 id={headingId} className="text-base font-semibold text-brand-navy">
              {raceName}
            </h3>
            <ul className="space-y-3">
              {group.views.map((view) => {
                const { video, athlete, linkHost } = view;
                const confirming = confirmingId === video.videoId;
                const analysisHref = raceVideoAnalysisHref(eventId, video.videoId);
                const athleteName = athlete?.displayName ?? t(locale, "raceDay.videos.item.unknownAthlete");
                const suffix = <span className="sr-only"> {`${video.label} ${athleteName}`}</span>;

                return (
                  <li key={video.videoId} className="rounded-card border border-brand-navy/10 bg-white p-4 shadow-card">
                    <p className="text-base font-semibold text-brand-navy min-w-0 break-words">{video.label}</p>
                    <p className="mt-1 text-sm text-brand-navy/70">
                      {athleteName}
                      {athlete ? ` · #${athlete.bib}` : ""}
                    </p>
                    {video.externalUrl !== null && linkHost !== null ? (
                      <p className="text-sm">
                        <a
                          href={video.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-11 items-center font-semibold text-brand-navy underline underline-offset-2"
                        >
                          {t(locale, "raceDay.videos.item.openLink", { host: linkHost })}
                        </a>
                      </p>
                    ) : null}
                    {video.storedWhere ? (
                      <p className="mt-1 text-sm text-brand-navy/70">
                        {t(locale, "raceDay.videos.item.storedWhere", { where: video.storedWhere })}
                      </p>
                    ) : null}
                    {video.note ? <p className="mt-1 text-sm text-brand-navy/70">{video.note}</p> : null}

                    <div className="mt-3 flex flex-wrap gap-2">
                      {confirming ? (
                        <>
                          <div className="w-full">
                            <FormMessage tone="error">{t(locale, "raceDay.videos.item.deleteWarning")}</FormMessage>
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            className={DANGER_BUTTON}
                            onClick={() => {
                              setConfirmingId(null);
                              onDelete(view);
                            }}
                          >
                            {t(locale, "raceDay.common.confirmDelete")}
                            {suffix}
                          </button>
                          <button
                            type="button"
                            className={SECONDARY_BUTTON}
                            onClick={() => {
                              setConfirmingId(null);
                            }}
                          >
                            {t(locale, "raceDay.common.cancel")}
                          </button>
                        </>
                      ) : (
                        <>
                          {/* A plain link: the Analysis page shows this record as context and the user
                              picks the file there. Only the two ids travel (ADR-010). */}
                          {analysisHref ? (
                            <Link to={analysisHref} className={SECONDARY_BUTTON}>
                              {t(locale, "raceDay.videos.item.analyze")}
                              {suffix}
                            </Link>
                          ) : null}
                          <button
                            type="button"
                            disabled={busy}
                            className={SECONDARY_BUTTON}
                            onClick={() => {
                              onEdit(view);
                            }}
                          >
                            {t(locale, "raceDay.common.edit")}
                            {suffix}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            className={SECONDARY_BUTTON}
                            onClick={() => {
                              setConfirmingId(video.videoId);
                            }}
                          >
                            {t(locale, "raceDay.common.delete")}
                            {suffix}
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
