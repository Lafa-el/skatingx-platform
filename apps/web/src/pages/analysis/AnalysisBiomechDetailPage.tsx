import {
  getFirestoreDb,
  getSavedAnalysis,
  getVideoEntry,
  type SavedAnalysisDetail,
  type SavedAnalysisFrame,
} from "@skatingx/firebase-client";
import { pacingDistanceConfigs } from "@skatingx/skating-domain";
import { ErrorNotice } from "@skatingx/ui";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "@/app/providers/AuthProvider";
import { useLocale } from "@/hooks/useLocale";
import { tAnalysis, type AnalysisMessageKey } from "@/shared/i18n/analysis-messages";
import { tBiomech } from "@/shared/i18n/biomech-messages";
import { formatCalendarDate } from "@/shared/i18n/format";
import { tPace, type PaceMessageKey } from "@/shared/i18n/pacing-messages";
import type { Locale } from "@/shared/i18n/translator";
import { logActionFailure } from "@/shared/utils/logActionFailure";

/**
 * Read-only frames for one saved biomechanics record, opened from the hub.
 * The sampling tool stays the place a new session is recorded.
 */

function LibrarySource({ videoId }: { videoId: string }) {
  const locale = useLocale();
  const { uid } = useAuth();
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    const db = getFirestoreDb();
    if (!db) return;
    let cancelled = false;
    void getVideoEntry(db, uid, videoId)
      .then((entry) => {
        if (!cancelled) setTitle(entry?.title ?? null);
      })
      .catch((error: unknown) => {
        logActionFailure("biomechanics", "library-video", error);
        if (!cancelled) setTitle(null);
      });
    return () => {
      cancelled = true;
    };
  }, [uid, videoId]);

  return (
    <p className="mt-4">
      <Link className={CTA_CLASS} to="/analysis/videos">
        {title ? tAnalysis(locale, "analysis.libraryVideo.source", { title }) : tAnalysis(locale, "analysis.libraryVideo.back")}
      </Link>
    </p>
  );
}

const CTA_CLASS =
  "inline-flex min-h-11 items-center text-sm font-semibold text-brand-navy underline underline-offset-2";

const NUMBER_LOCALE: Record<Locale, string> = { zh: "zh-CN", en: "en-US" };

const RATING_KEY: Record<"excellent" | "needs-work" | "moderate", PaceMessageKey> = {
  excellent: "pace.rating.excellent",
  "needs-work": "pace.rating.reinforce",
  moderate: "pace.rating.steady",
};

/**
 * The hub hero turns these stored codes into one suggestion sentence.
 * A code with no sentence is shown as stored.
 */
const HERO_FINDING: Record<string, AnalysisMessageKey> = {
  "biomech.knee.high": "analysis.hub.feedback.biomech",
  "biomech.lean.high": "analysis.hub.feedback.biomech",
  "biomech.pelvis.high": "analysis.hub.feedback.biomech",
  "pace.decay.back-half": "analysis.hub.feedback.pace",
  "pace.total.versus-benchmark": "analysis.hub.feedback.pace",
};

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "missing" }
  | { readonly status: "error" }
  | { readonly status: "ready"; readonly record: SavedAnalysisDetail };

function formatWhen(locale: Locale, createdAt: string): string {
  const day = createdAt.slice(0, 10);
  const formatted = formatCalendarDate(day, locale);
  return formatted === day && createdAt.length > 10 ? createdAt : formatted;
}

function formatFixed(value: number, locale: Locale, digits: number): string {
  return new Intl.NumberFormat(NUMBER_LOCALE[locale], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  }).format(value);
}

function formatLoose(value: number, locale: Locale): string {
  return new Intl.NumberFormat(NUMBER_LOCALE[locale], {
    maximumFractionDigits: 1,
    useGrouping: false,
  }).format(value);
}

function missing(locale: Locale): string {
  return tAnalysis(locale, "analysis.hub.value.missing");
}

function angleText(value: number | null, locale: Locale): string {
  if (value === null) return missing(locale);
  return tAnalysis(locale, "analysis.hub.value.angle", { value: formatLoose(value, locale) });
}

function findingText(code: string, locale: Locale): string {
  if (code.startsWith("equipment.symptom.")) return tAnalysis(locale, "analysis.hub.feedback.equipment");
  const key = HERO_FINDING[code];
  return key ? tAnalysis(locale, key) : code;
}

function supportText(frame: SavedAnalysisFrame, locale: Locale): string {
  const side =
    frame.supportSide === "left"
      ? tBiomech(locale, "biomech.support.left")
      : frame.supportSide === "right"
        ? tBiomech(locale, "biomech.support.right")
        : tAnalysis(locale, "analysis.hub.detail.support.unknown");
  const confidence = frame.supportConfidence === null ? missing(locale) : `${formatLoose(frame.supportConfidence, locale)}%`;
  return `${side} ${confidence}`;
}

function statusText(frame: SavedAnalysisFrame, locale: Locale): string {
  const base = frame.readable
    ? tAnalysis(locale, "analysis.hub.detail.status.readable")
    : (frame.unreadableReason ?? missing(locale));
  if (!frame.manual) return base;
  return `${base} · ${tAnalysis(locale, "analysis.hub.detail.status.manual")}`;
}

function pelvisText(value: number | null, locale: Locale): string {
  if (value === null) return missing(locale);
  return `${formatFixed(value, locale, 1)}%`;
}

function BackLink({ locale }: { locale: Locale }) {
  return (
    <Link to="/analysis" className={CTA_CLASS}>
      {tAnalysis(locale, "analysis.hub.detail.back")}
    </Link>
  );
}

function HeaderField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-semibold text-brand-navy">{label}</dt>
      <dd className="text-brand-navy">{value}</dd>
    </div>
  );
}

export function AnalysisBiomechDetailPage() {
  const locale = useLocale();
  const { analysisId } = useParams();
  const { uid, loading: authLoading } = useAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (authLoading) return;
    if (!uid || !analysisId) {
      setState({ status: "missing" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    const db = getFirestoreDb();
    if (!db) {
      setState({ status: "error" });
      return;
    }
    getSavedAnalysis(db, uid, analysisId)
      .then((record) => {
        if (cancelled) return;
        if (!record || record.kind !== "biomech") setState({ status: "missing" });
        else setState({ status: "ready", record });
      })
      .catch((error: unknown) => {
        logActionFailure("analysis", "frame-detail", error);
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [analysisId, authLoading, uid]);

  const record = state.status === "ready" ? state.record : null;
  const distance = record?.distance ? pacingDistanceConfigs[record.distance].title : missing(locale);
  const rating = record?.pace?.rating ? tPace(locale, RATING_KEY[record.pace.rating]) : missing(locale);

  return (
    <section>
      <BackLink locale={locale} />
      <h1 className="mt-2 text-2xl font-bold text-brand-navy">{tAnalysis(locale, "analysis.hub.detail.title")}</h1>
      {state.status === "loading" ? (
        <p role="status" className="mt-4 text-brand-navy/80">
          {tAnalysis(locale, "analysis.hub.detail.loading")}
        </p>
      ) : null}
      {state.status === "missing" ? (
        <p role="status" className="mt-4 text-brand-navy">
          {tAnalysis(locale, "analysis.hub.detail.missing")}
        </p>
      ) : null}
      {state.status === "error" ? (
        <ErrorNotice className="mt-4">{tAnalysis(locale, "analysis.hub.detail.error")}</ErrorNotice>
      ) : null}
      {record ? (
        <>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <HeaderField label={tAnalysis(locale, "analysis.hub.detail.date")} value={formatWhen(locale, record.createdAt)} />
            <HeaderField label={tAnalysis(locale, "analysis.hub.detail.distance")} value={distance} />
            <HeaderField label={tAnalysis(locale, "analysis.hub.metric.rating")} value={rating} />
            <HeaderField
              label={tAnalysis(locale, "analysis.hub.metric.knee")}
              value={angleText(record.biomech?.avgKnee ?? null, locale)}
            />
            <HeaderField
              label={tAnalysis(locale, "analysis.hub.metric.lean")}
              value={angleText(record.biomech?.avgLean ?? null, locale)}
            />
            <div className="sm:col-span-2">
              <dt className="text-sm font-semibold text-brand-navy">{tAnalysis(locale, "analysis.hub.detail.findings")}</dt>
              {record.findings.length === 0 ? (
                <dd className="text-brand-navy">{missing(locale)}</dd>
              ) : (
                <dd>
                  <ul className="grid gap-1">
                    {record.findings.map((finding) => (
                      <li key={finding.code}>{findingText(finding.code, locale)}</li>
                    ))}
                  </ul>
                </dd>
              )}
            </div>
          </dl>
          {record.videoId ? <LibrarySource videoId={record.videoId} /> : null}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-left text-sm text-brand-navy">
              <thead>
                <tr className="border-b border-brand-navy/15">
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    {tAnalysis(locale, "analysis.hub.detail.column.time")}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    {tAnalysis(locale, "analysis.hub.metric.knee")}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    {tAnalysis(locale, "analysis.hub.metric.lean")}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    {tBiomech(locale, "biomech.metric.pelvis")}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    {tBiomech(locale, "biomech.support")}
                  </th>
                  <th scope="col" className="py-2 font-semibold">
                    {tAnalysis(locale, "analysis.hub.detail.column.status")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {record.frames.map((frame, index) => (
                  <tr key={`${frame.timeSeconds}-${index}`} className="border-b border-brand-navy/10">
                    <td className="py-2 pr-3">{formatFixed(frame.timeSeconds, locale, 2)}</td>
                    <td className="py-2 pr-3">{angleText(frame.kneeAngle, locale)}</td>
                    <td className="py-2 pr-3">{angleText(frame.leanAngle, locale)}</td>
                    <td className="py-2 pr-3">{pelvisText(frame.pelvisHeight, locale)}</td>
                    <td className="py-2 pr-3">{supportText(frame, locale)}</td>
                    <td className="py-2">{statusText(frame, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
