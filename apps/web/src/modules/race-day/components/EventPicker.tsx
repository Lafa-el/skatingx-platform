import type { RaceEvent } from "@skatingx/schema";

import { useLocale } from "@/hooks/useLocale";

import { t } from "../i18n/messages";

/** Chooses the event to work on. Renders nothing when there is only one to choose from. */
export function EventPicker({
  events,
  activeEventId,
  onChange,
}: {
  events: readonly RaceEvent[];
  activeEventId: string | null;
  onChange: (eventId: string) => void;
}) {
  const locale = useLocale();
  if (events.length < 2) {
    return null;
  }
  return (
    <label className="block text-sm font-medium text-brand-navy">
      {t(locale, "raceDay.setup.event.current")}
      <select
        value={activeEventId ?? ""}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="mt-1 block min-h-11 w-full rounded-control border border-brand-navy/50 bg-white px-3 py-2 text-base text-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
      >
        {events.map((e) => (
          <option key={e.eventId} value={e.eventId}>
            {e.name}
          </option>
        ))}
      </select>
    </label>
  );
}
