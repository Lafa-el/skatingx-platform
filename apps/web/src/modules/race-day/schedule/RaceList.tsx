import type { RaceEntry, RaceRosterEntry } from "@skatingx/schema";
import { groupRaceEntriesByDay, sortRaceEntries } from "@skatingx/skating-domain";
import { useMemo, useState } from "react";

import { useLocale } from "@/hooks/useLocale";

import { VerificationBadge } from "../components/VerificationBadge";
import { DANGER_BUTTON, SECONDARY_BUTTON } from "../components/fields";
import { t } from "../i18n/messages";
import { formatRaceDay, formatRaceTime } from "../lib/schedule";

type RaceListProps = {
  races: RaceEntry[];
  roster: readonly RaceRosterEntry[];
  timeZone: string | null;
  busy: boolean;
  onEdit: (race: RaceEntry) => void;
  onSetVerified: (race: RaceEntry, verified: boolean) => void;
  onDelete: (race: RaceEntry) => void;
};

export function RaceList({ races, roster, timeZone, busy, onEdit, onSetVerified, onDelete }: RaceListProps) {
  const locale = useLocale();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const groups = useMemo(() => groupRaceEntriesByDay(races), [races]);
  // Position in the whole schedule: two "500m" races are told apart by their number.
  const position = useMemo(() => {
    const map = new Map<string, number>();
    sortRaceEntries(races).forEach((race, index) => map.set(race.raceId, index + 1));
    return map;
  }, [races]);
  const nameById = useMemo(
    () => new Map(roster.map((entry) => [entry.rosterId, entry.displayName])),
    [roster],
  );

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.day ?? "unknown-day"} className="space-y-2">
          <h3 className="text-base font-semibold text-slate-800">
            {group.day ? formatRaceDay(group.day, locale) : t(locale, "raceDay.schedule.dayUnknown")}
          </h3>
          <ul className="space-y-3">
            {group.races.map((race) => {
              const number = position.get(race.raceId) ?? 0;
              const confirming = confirmingId === race.raceId;
              const verified = race.verification === "verified";
              const suffix = <span className="sr-only"> {`${race.label} #${number}`}</span>;
              return (
                <li key={race.raceId} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-slate-500">#{number}</span>
                    <span className="text-base font-semibold text-slate-900">{race.label}</span>
                    {race.round ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                        {t(locale, "raceDay.schedule.round", { round: race.round })}
                      </span>
                    ) : null}
                    {race.heat ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                        {t(locale, "raceDay.schedule.heat", { heat: race.heat })}
                      </span>
                    ) : null}
                    <VerificationBadge verification={race.verification} />
                  </div>
                  <p className="mt-1 text-sm text-slate-700">
                    {race.scheduledAt
                      ? formatRaceTime(race.scheduledAt, locale, timeZone)
                      : t(locale, "raceDay.schedule.timeUnknown")}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {race.rosterIds.length === 0
                      ? t(locale, "raceDay.schedule.noAthletes")
                      : race.rosterIds
                          .map((id) => nameById.get(id) ?? t(locale, "raceDay.schedule.unknownAthlete"))
                          .join(", ")}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {confirming ? (
                      <>
                        <p role="alert" className="w-full text-sm font-medium text-red-800">
                          {t(locale, "raceDay.schedule.deleteWarning")}
                        </p>
                        <button
                          type="button"
                          disabled={busy}
                          className={DANGER_BUTTON}
                          onClick={() => {
                            setConfirmingId(null);
                            onDelete(race);
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
                        <button
                          type="button"
                          disabled={busy}
                          className={SECONDARY_BUTTON}
                          onClick={() => {
                            onEdit(race);
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
                            onSetVerified(race, !verified);
                          }}
                        >
                          {t(
                            locale,
                            verified ? "raceDay.verification.markPending" : "raceDay.verification.markVerified",
                          )}
                          {suffix}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className={SECONDARY_BUTTON}
                          onClick={() => {
                            setConfirmingId(race.raceId);
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
      ))}
    </div>
  );
}
