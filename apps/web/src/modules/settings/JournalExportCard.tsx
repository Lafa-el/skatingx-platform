import type { JournalExportCollection } from "@skatingx/firebase-client";
import type { ExportScopeInput, JournalExportBundle } from "@skatingx/skating-domain";
import { Button, Card, ErrorNotice } from "@skatingx/ui";
import { useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useLocale } from "@/hooks/useLocale";
import { tSettingsPage, type SettingsPageMessageKey } from "@/shared/i18n/settings-page-messages";
import { downloadFile } from "@/shared/utils/downloadFile";

const COLLECTIONS = ["days", "sessions", "coachNotes", "bodyStatus", "weeklyReviews", "videos"] as const;

const CSV_SLUG: Record<JournalExportCollection, string> = {
  days: "days",
  sessions: "sessions",
  coachNotes: "coach-notes",
  bodyStatus: "body-status",
  weeklyReviews: "weekly-reviews",
  videos: "videos",
};

const LABEL: Record<JournalExportCollection, SettingsPageMessageKey> = {
  days: "settings.export.collection.days",
  sessions: "settings.export.collection.sessions",
  coachNotes: "settings.export.collection.coachNotes",
  bodyStatus: "settings.export.collection.bodyStatus",
  weeklyReviews: "settings.export.collection.weeklyReviews",
  videos: "settings.export.collection.videos",
};

type ScopeKind = "all" | "range" | "week";
type ExportFormat = "json" | "csv";

type ExportResult = {
  counts: Record<JournalExportCollection, number>;
  skipped: JournalExportCollection[];
  failed: JournalExportCollection[];
};

function countsOf(data: JournalExportBundle): Record<JournalExportCollection, number> {
  return {
    days: data.days.length,
    sessions: data.sessions.length,
    coachNotes: data.coachNotes.length,
    bodyStatus: data.bodyStatus.length,
    weeklyReviews: data.weeklyReviews.length,
    videos: data.videos.length,
  };
}

export function JournalExportCard() {
  const locale = useLocale();
  const t = (key: SettingsPageMessageKey, params?: Record<string, string | number>) => tSettingsPage(locale, key, params);
  const { uid } = useAuth();
  const [scopeKind, setScopeKind] = useState<ScopeKind>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [weekDay, setWeekDay] = useState("");
  const [format, setFormat] = useState<ExportFormat>("json");
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState<"range" | "week" | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);

  async function download() {
    setInvalid(null);
    setResult(null);
    const input: ExportScopeInput =
      scopeKind === "range" ? { kind: "range", from, to } : { kind: "week", day: weekDay };
    setBusy(true);
    try {
      const {
        buildCollectionCsv,
        buildExportJson,
        filterExportByScope,
        getFirestoreDb,
        prepareExportScope,
        readJournalExport,
        todayDateString,
      } = await import("./journalExportRead");
      const prepared = prepareExportScope(scopeKind === "all" ? { kind: "all" } : input);
      if (!prepared.ok) {
        setInvalid(scopeKind === "week" ? "week" : "range");
        return;
      }
      const db = getFirestoreDb();
      if (!uid || !db) return;
      const read = await readJournalExport(db, uid);
      const filtered = filterExportByScope(read, prepared.scope);
      const day = todayDateString();
      const skipped: JournalExportCollection[] = [];
      if (format === "json") {
        downloadFile(
          `skatingx-journal-${day}.json`,
          buildExportJson(filtered, new Date().toISOString()),
          "application/json",
        );
      } else {
        for (const name of COLLECTIONS) {
          const csv = buildCollectionCsv(filtered[name] as readonly object[]);
          if (!csv) {
            skipped.push(name);
            continue;
          }
          downloadFile(`skatingx-journal-${CSV_SLUG[name]}-${day}.csv`, csv, "text/csv;charset=utf-8");
        }
      }
      setResult({ counts: countsOf(filtered), skipped, failed: read.failedCollections });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card variant="raised" title={t("settings.export.title")}>
      <p className="text-sm text-brand-navy/80">{t("settings.export.intro")}</p>
      {!uid ? <p className="mt-3 text-sm text-brand-navy">{t("settings.export.signedOut")}</p> : null}
      <div role="group" aria-label={t("settings.export.scope")} className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["all", "settings.export.scope.all"],
            ["range", "settings.export.scope.range"],
            ["week", "settings.export.scope.week"],
          ] as const
        ).map(([value, key]) => (
          <Button
            key={value}
            variant={scopeKind === value ? "brand" : "outline"}
            aria-pressed={scopeKind === value}
            onClick={() => setScopeKind(value)}
          >
            {t(key)}
          </Button>
        ))}
      </div>
      {scopeKind === "range" ? (
        <div className="mt-3 grid gap-3">
          <label className="block text-sm font-medium text-brand-navy" htmlFor="export-from">
            {t("settings.export.field.from")}
            <input
              id="export-from"
              type="date"
              className="mt-1 min-h-11 w-full rounded-control border border-brand-navy/50 bg-white px-3 text-brand-navy"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium text-brand-navy" htmlFor="export-to">
            {t("settings.export.field.to")}
            <input
              id="export-to"
              type="date"
              className="mt-1 min-h-11 w-full rounded-control border border-brand-navy/50 bg-white px-3 text-brand-navy"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
        </div>
      ) : null}
      {scopeKind === "week" ? (
        <label className="mt-3 block text-sm font-medium text-brand-navy" htmlFor="export-week">
          {t("settings.export.field.week")}
          <input
            id="export-week"
            type="date"
            className="mt-1 min-h-11 w-full rounded-control border border-brand-navy/50 bg-white px-3 text-brand-navy"
            value={weekDay}
            onChange={(event) => setWeekDay(event.target.value)}
          />
        </label>
      ) : null}
      <div role="group" aria-label={t("settings.export.format")} className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["json", "settings.export.format.json"],
            ["csv", "settings.export.format.csv"],
          ] as const
        ).map(([value, key]) => (
          <Button
            key={value}
            variant={format === value ? "brand" : "outline"}
            aria-pressed={format === value}
            onClick={() => setFormat(value)}
          >
            {t(key)}
          </Button>
        ))}
      </div>
      {invalid === "range" ? <ErrorNotice className="mt-3">{t("settings.export.rangeInvalid")}</ErrorNotice> : null}
      {invalid === "week" ? <ErrorNotice className="mt-3">{t("settings.export.weekInvalid")}</ErrorNotice> : null}
      <Button className="mt-4" disabled={!uid || busy} aria-busy={busy} onClick={() => void download()}>
        {busy ? t("settings.export.busy") : t("settings.export.download")}
      </Button>
      {result ? (
        <div role="status" className="mt-4 grid gap-1 text-sm text-brand-navy">
          <p>
            {t("settings.export.result.counts", {
              days: result.counts.days,
              sessions: result.counts.sessions,
              coachNotes: result.counts.coachNotes,
              bodyStatus: result.counts.bodyStatus,
              weeklyReviews: result.counts.weeklyReviews,
              videos: result.counts.videos,
            })}
          </p>
          {result.skipped.map((name) => (
            <p key={`skip-${name}`}>{t("settings.export.result.skipped", { name: t(LABEL[name]) })}</p>
          ))}
          {result.failed.map((name) => (
            <p key={`fail-${name}`}>{t("settings.export.result.failed", { name: t(LABEL[name]) })}</p>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
