import { DEFAULT_ATHLETE_ID } from "@skatingx/schema";
import {
  trainingFeedbackKey,
  type EquipmentHistoryRecord,
  type EquipmentSymptomKey,
  type PlanFocus,
  type TrainingFeedback,
} from "@skatingx/skating-domain";
import {
  getFirestoreDb,
  subscribeToEquipmentHistory,
  subscribeToSavedAnalyses,
  type SavedAnalysisSource,
} from "@skatingx/firebase-client";
import { Button, Card, ErrorNotice, StatusTag } from "@skatingx/ui";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "@/app/providers/AuthProvider";
import { useLocale } from "@/hooks/useLocale";
import { readHiddenFeedback, usePlanFocus, writeHiddenFeedback } from "@/modules/training/plan/plan-session";
import { tAnalysis, type AnalysisMessageKey } from "@/shared/i18n/analysis-messages";
import { tEquipment, type EquipmentMessageKey } from "@/shared/i18n/equipment-messages";
import { formatCalendarDate } from "@/shared/i18n/format";
import { tPace, type PaceMessageKey } from "@/shared/i18n/pacing-messages";
import { tPlan, type PlanMessageKey } from "@/shared/i18n/plan-messages";
import type { Locale } from "@/shared/i18n/translator";
import { logActionFailure } from "@/shared/utils/logActionFailure";

import {
  buildHubModel,
  type HubAnalysisInput,
  type HubAngleCard,
  type HubEquipmentCard,
  type HubEquipmentInput,
  type HubLane,
  type HubMetric,
  type HubPaceCard,
  type HubPaceRating,
  type HubRecentItem,
  type HubTool,
} from "./hub-model";

const TOOL_ROUTE = {
  biomech: "/analysis/biomechanics",
  pace: "/analysis/pacing",
  equipment: "/analysis/equipment",
} as const;

const FOCUS_TITLE: Record<PlanFocus, PlanMessageKey> = {
  lean: "plan.focus.lean.title",
  bounce: "plan.focus.bounce.title",
  endurance: "plan.focus.endurance.title",
};

const RATING_KEY: Record<HubPaceRating, PaceMessageKey> = {
  excellent: "pace.rating.excellent",
  "needs-work": "pace.rating.reinforce",
  moderate: "pace.rating.steady",
};

const SYMPTOM_FOCUS: Record<EquipmentSymptomKey, EquipmentMessageKey> = {
  slide: "equipment.advice.slide.focus",
  "boot-out": "equipment.advice.bootOut.focus",
  unstable: "equipment.advice.unstable.focus",
  ankle: "equipment.advice.ankle.focus",
  release: "equipment.advice.release.focus",
  asymmetry: "equipment.advice.asymmetry.focus",
};

const CTA_CLASS =
  "inline-flex min-h-11 items-center text-sm font-semibold text-brand-navy underline underline-offset-2";

function formatWhen(locale: Locale, createdAt: string): string {
  const day = createdAt.slice(0, 10);
  const formatted = formatCalendarDate(day, locale);
  return formatted === day && createdAt.length > 10 ? createdAt : formatted;
}

const NUMBER_LOCALE: Record<Locale, string> = { zh: "zh-CN", en: "en-US" };

function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(NUMBER_LOCALE[locale], { maximumFractionDigits: 1 }).format(value);
}

function formatSigned(value: number, locale: Locale): string {
  const arrow = value > 0 ? "↑" : value < 0 ? "↓" : "→";
  const number = new Intl.NumberFormat(NUMBER_LOCALE[locale], {
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  }).format(value);
  return tAnalysis(locale, "analysis.hub.delta", { value: `${arrow} ${number}` });
}

function angleText(value: number | null, locale: Locale): string {
  if (value === null) return tAnalysis(locale, "analysis.hub.value.missing");
  return tAnalysis(locale, "analysis.hub.value.angle", { value: formatNumber(value, locale) });
}

function percentText(value: number | null, locale: Locale): string {
  if (value === null) return tAnalysis(locale, "analysis.hub.value.missing");
  return tAnalysis(locale, "analysis.hub.value.percent", { value: formatNumber(value, locale) });
}

function ratingText(rating: HubPaceRating | null, locale: Locale): string {
  return rating ? tPace(locale, RATING_KEY[rating]) : tAnalysis(locale, "analysis.hub.value.missing");
}

function equipmentSummary(symptomKey: string, symptomText: string, locale: Locale): string {
  const focusKey = symptomKey in SYMPTOM_FOCUS ? SYMPTOM_FOCUS[symptomKey as EquipmentSymptomKey] : null;
  const focus = focusKey ? tEquipment(locale, focusKey) : tEquipment(locale, "equipment.symptom.empty");
  const text = symptomText.trim() || tEquipment(locale, "equipment.symptom.empty");
  return tAnalysis(locale, "analysis.hub.equipment.summary", { focus, text });
}

function headline(item: HubRecentItem, locale: Locale): string {
  if (item.kind === "biomech") {
    return tAnalysis(locale, "analysis.hub.headline.biomech", {
      lean: angleText(item.avgLean, locale),
      knee: angleText(item.avgKnee, locale),
    });
  }
  if (item.kind === "pace") {
    const rating = ratingText(item.rating, locale);
    if (item.stabilityIndexPercent === null) return rating;
    return tAnalysis(locale, "analysis.hub.headline.pace", {
      rating,
      stability: percentText(item.stabilityIndexPercent, locale),
    });
  }
  return equipmentSummary(item.symptomKey, item.symptomText, locale);
}

function stickerKey(kind: HubRecentItem["kind"]): AnalysisMessageKey {
  if (kind === "biomech") return "analysis.hub.cockpit.biomech";
  if (kind === "pace") return "analysis.hub.cockpit.pace";
  return "analysis.hub.cockpit.equipment";
}

function toAnalysis(row: SavedAnalysisSource): HubAnalysisInput {
  return {
    kind: row.kind,
    id: row.id,
    createdAt: row.createdAt,
    findings: row.findings,
    avgKnee: row.biomech?.avgKnee ?? null,
    avgLean: row.biomech?.avgLean ?? null,
    decayPercent: row.pace?.decayPercent ?? null,
    stabilityIndexPercent: row.pace?.stabilityIndexPercent ?? null,
    rating: row.pace?.rating ?? null,
  };
}

function toEquipment(row: EquipmentHistoryRecord): HubEquipmentInput | null {
  if (typeof row.id !== "string" || row.id.length === 0 || typeof row.createdAt !== "string") return null;
  return {
    id: row.id,
    createdAt: row.createdAt,
    symptomKey: typeof row.symptomKey === "string" ? row.symptomKey : "",
    symptomText: typeof row.symptomText === "string" ? row.symptomText : "",
    findings: row.findings ?? [],
  };
}

function Sparkline({ values }: { values: readonly number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 120;
  const height = 32;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - 2 - ((value - min) / span) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 h-8 w-full text-brand-flame" aria-hidden="true">
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points} />
    </svg>
  );
}

function MetricReadout({
  label,
  value,
  delta,
  spark,
}: {
  label: string;
  value: string;
  delta: string | null;
  spark: readonly number[];
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-brand-navy">{label}</p>
      <p className="sx-numeric text-4xl text-brand-flame">{value}</p>
      {delta ? <p className="text-sm font-semibold text-brand-navy">{delta}</p> : null}
      <Sparkline values={spark} />
    </div>
  );
}

function metricDelta(metric: HubMetric, locale: Locale): string | null {
  return metric.delta === null ? null : formatSigned(metric.delta, locale);
}

function LaneError({ message, retryLabel, onRetry }: { message: string; retryLabel: string; onRetry: () => void }) {
  return (
    <div className="grid gap-3">
      <ErrorNotice>{message}</ErrorNotice>
      <Button type="button" variant="outline" onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}

function EmptyLane({ body, cta, to }: { body: string; cta: string; to: string }) {
  return (
    <div className="grid gap-2">
      <p>{body}</p>
      <Link to={to} className={CTA_CLASS}>
        {cta}
      </Link>
    </div>
  );
}

export function AnalysisHubPage() {
  const locale = useLocale();
  const { uid, loading: authLoading } = useAuth();
  const [analyses, setAnalyses] = useState<HubLane<HubAnalysisInput>>({ status: "loading" });
  const [equipment, setEquipment] = useState<HubLane<HubEquipmentInput>>({ status: "loading" });
  const [analysesAttempt, setAnalysesAttempt] = useState(0);
  const [equipmentAttempt, setEquipmentAttempt] = useState(0);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => readHiddenFeedback());
  const [focus, setFocus] = usePlanFocus();

  useEffect(() => {
    if (!uid) return;
    const db = getFirestoreDb();
    if (!db) {
      setAnalyses({ status: "error" });
      return;
    }
    setAnalyses({ status: "loading" });
    return subscribeToSavedAnalyses(
      db,
      uid,
      (rows) => setAnalyses({ status: "ready", records: rows.map(toAnalysis) }),
      (error) => {
        logActionFailure("analysis-hub", "read-analyses", error);
        setAnalyses({ status: "error" });
      },
    );
  }, [uid, analysesAttempt]);

  useEffect(() => {
    if (!uid) return;
    const db = getFirestoreDb();
    if (!db) {
      setEquipment({ status: "error" });
      return;
    }
    setEquipment({ status: "loading" });
    return subscribeToEquipmentHistory(
      db,
      uid,
      DEFAULT_ATHLETE_ID,
      (rows) => setEquipment({ status: "ready", records: rows.flatMap((row) => {
        const mapped = toEquipment(row);
        return mapped ? [mapped] : [];
      }) }),
      (error) => {
        logActionFailure("analysis-hub", "read-equipment", error);
        setEquipment({ status: "error" });
      },
    );
  }, [uid, equipmentAttempt]);

  const retryAnalyses = () => {
    setAnalyses({ status: "loading" });
    setAnalysesAttempt((attempt) => attempt + 1);
  };
  const retryEquipment = () => {
    setEquipment({ status: "loading" });
    setEquipmentAttempt((attempt) => attempt + 1);
  };

  const ignore = (item: TrainingFeedback) => {
    const next = new Set(hidden);
    next.add(trainingFeedbackKey(item));
    setHidden(next);
    writeHiddenFeedback(next);
  };

  const model = buildHubModel({ analyses, equipment, hidden });

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <h1 className="text-xl font-bold text-brand-navy">{tAnalysis(locale, "analysis.hub.title")}</h1>
        <p className="text-sm text-brand-navy/80">{tAnalysis(locale, "analysis.hub.description")}</p>
      </header>
      {authLoading ? (
        <p role="status" className="text-sm text-brand-navy/80">
          {tAnalysis(locale, "analysis.hub.preparing")}
        </p>
      ) : !uid ? (
        <ErrorNotice>{tAnalysis(locale, "analysis.hub.signedOut")}</ErrorNotice>
      ) : (
        <>
          <SuggestionCard
            suggestion={model.suggestion}
            locale={locale}
            focus={focus}
            onAccept={setFocus}
            onIgnore={ignore}
            onRetry={() => {
              if (analyses.status !== "ready") retryAnalyses();
              if (equipment.status === "error") retryEquipment();
            }}
          />
          <section className="grid gap-4 md:grid-cols-3">
            <AngleCockpit
              card={model.biomech}
              locale={locale}
              onRetry={retryAnalyses}
            />
            <PaceCockpit card={model.pace} locale={locale} onRetry={retryAnalyses} />
            <EquipmentCockpit card={model.equipment} locale={locale} onRetry={retryEquipment} />
          </section>
          <section className="grid gap-4 md:grid-cols-3">
            <ToolCard
              title={tAnalysis(locale, "analysis.hub.tool.biomech")}
              to={TOOL_ROUTE.biomech}
              tool={model.tools.biomech}
              locale={locale}
              errorKey="analysis.hub.error.analyses"
            />
            <ToolCard
              title={tAnalysis(locale, "analysis.hub.tool.pace")}
              to={TOOL_ROUTE.pace}
              tool={model.tools.pace}
              locale={locale}
              errorKey="analysis.hub.error.analyses"
            />
            <ToolCard
              title={tAnalysis(locale, "analysis.hub.tool.equipment")}
              to={TOOL_ROUTE.equipment}
              tool={model.tools.equipment}
              locale={locale}
              errorKey="analysis.hub.error.equipment"
            />
          </section>
          <RecentList recent={model.recent} locale={locale} />
        </>
      )}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  locale,
  focus,
  onAccept,
  onIgnore,
  onRetry,
}: {
  suggestion: ReturnType<typeof buildHubModel>["suggestion"];
  locale: Locale;
  focus: PlanFocus | null;
  onAccept: (focus: PlanFocus) => void;
  onIgnore: (item: TrainingFeedback) => void;
  onRetry: () => void;
}) {
  if (suggestion.status === "none") return null;
  if (suggestion.status === "loading") {
    return (
      <p role="status" className="text-sm text-brand-navy/80">
        {tAnalysis(locale, "analysis.hub.preparing")}
      </p>
    );
  }
  if (suggestion.status === "error") {
    return (
      <div data-testid="hub-suggestion" data-status="error">
        <LaneError
          message={tAnalysis(locale, "analysis.hub.error.feedback")}
          retryLabel={tAnalysis(locale, "analysis.hub.retry.feedback")}
          onRetry={onRetry}
        />
      </div>
    );
  }
  const item = suggestion.feedback;
  const date = formatWhen(locale, item.createdAt);
  const body =
    item.type === "review-equipment"
      ? "analysis.hub.feedback.equipment"
      : item.sourceKind === "pace"
        ? "analysis.hub.feedback.pace"
        : "analysis.hub.feedback.biomech";
  const source =
    item.sourceKind === "pace"
      ? "analysis.hub.feedback.source.pace"
      : item.sourceKind === "biomech"
        ? "analysis.hub.feedback.source.biomech"
        : "analysis.hub.feedback.source.equipment";
  return (
    <div data-testid="hub-suggestion" data-status="ready">
      <Card variant="hero" title={tAnalysis(locale, "analysis.hub.feedback.title")}>
        <p className="font-semibold">{tAnalysis(locale, body)}</p>
        <p>{tAnalysis(locale, source, { id: item.analysisId, date })}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {item.type === "set-focus" ? (
            <Button type="button" onClick={() => onAccept(item.focus)} aria-pressed={focus === item.focus}>
              {tAnalysis(locale, "analysis.hub.feedback.accept")}
            </Button>
          ) : (
            <Link
              to="/analysis/equipment"
              className="inline-flex min-h-11 items-center rounded-control border border-brand-navy/50 px-4 py-2 text-sm font-semibold text-brand-navy"
            >
              {tAnalysis(locale, "analysis.hub.feedback.equipmentLink")}
            </Link>
          )}
          <Button type="button" variant="outline" onClick={() => onIgnore(item)}>
            {tAnalysis(locale, "analysis.hub.feedback.ignore")}
          </Button>
        </div>
        {item.type === "set-focus" && focus === item.focus ? (
          <p role="status" className="mt-3 font-semibold">
            {tAnalysis(locale, "analysis.hub.feedback.accepted", { focus: tPlan(locale, FOCUS_TITLE[item.focus]) })}
          </p>
        ) : null}
      </Card>
    </div>
  );
}

function AngleCockpit({ card, locale, onRetry }: { card: HubAngleCard; locale: Locale; onRetry: () => void }) {
  return (
    <div data-testid="hub-biomech" data-status={card.status}>
      <Card variant="raised" title={tAnalysis(locale, "analysis.hub.cockpit.biomech")}>
        {card.status === "loading" ? (
          <p role="status">{tAnalysis(locale, "analysis.hub.preparing")}</p>
        ) : card.status === "error" ? (
          <LaneError
            message={tAnalysis(locale, "analysis.hub.error.analyses")}
            retryLabel={tAnalysis(locale, "analysis.hub.retry.biomech")}
            onRetry={onRetry}
          />
        ) : card.status === "empty" ? (
          <EmptyLane
            body={tAnalysis(locale, "analysis.hub.empty.biomech")}
            cta={tAnalysis(locale, "analysis.hub.empty.cta.biomech")}
            to={TOOL_ROUTE.biomech}
          />
        ) : card.status === "single" ? (
          <div className="grid gap-3">
            <MetricReadout
              label={tAnalysis(locale, "analysis.hub.metric.lean")}
              value={angleText(card.avgLean, locale)}
              delta={null}
              spark={[]}
            />
            <MetricReadout
              label={tAnalysis(locale, "analysis.hub.metric.knee")}
              value={angleText(card.avgKnee, locale)}
              delta={null}
              spark={[]}
            />
          </div>
        ) : (
          <div className="grid gap-3">
            <MetricReadout
              label={tAnalysis(locale, "analysis.hub.metric.lean")}
              value={angleText(card.lean.latest, locale)}
              delta={metricDelta(card.lean, locale)}
              spark={card.lean.spark}
            />
            <MetricReadout
              label={tAnalysis(locale, "analysis.hub.metric.knee")}
              value={angleText(card.knee.latest, locale)}
              delta={metricDelta(card.knee, locale)}
              spark={card.knee.spark}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

function PaceCockpit({ card, locale, onRetry }: { card: HubPaceCard; locale: Locale; onRetry: () => void }) {
  return (
    <div data-testid="hub-pace" data-status={card.status}>
      <Card variant="raised" title={tAnalysis(locale, "analysis.hub.cockpit.pace")}>
        {card.status === "loading" ? (
          <p role="status">{tAnalysis(locale, "analysis.hub.preparing")}</p>
        ) : card.status === "error" ? (
          <LaneError
            message={tAnalysis(locale, "analysis.hub.error.analyses")}
            retryLabel={tAnalysis(locale, "analysis.hub.retry.pace")}
            onRetry={onRetry}
          />
        ) : card.status === "empty" ? (
          <EmptyLane
            body={tAnalysis(locale, "analysis.hub.empty.pace")}
            cta={tAnalysis(locale, "analysis.hub.empty.cta.pace")}
            to={TOOL_ROUTE.pace}
          />
        ) : (
          <div className="grid gap-3">
            <div>
              <p className="text-sm font-semibold text-brand-navy">
                {tAnalysis(locale, "analysis.hub.metric.rating")}
              </p>
              <p className="text-lg font-semibold text-brand-flame">{ratingText(card.rating, locale)}</p>
            </div>
            {card.stabilityIndexPercent !== null ? (
              <MetricReadout
                label={tAnalysis(locale, "analysis.hub.metric.stability")}
                value={percentText(card.stabilityIndexPercent, locale)}
                delta={null}
                spark={[]}
              />
            ) : null}
            {card.decay ? (
              <MetricReadout
                label={tAnalysis(locale, "analysis.hub.metric.decay")}
                value={percentText(card.decay.latest, locale)}
                delta={card.decay.delta !== null ? formatSigned(card.decay.delta, locale) : null}
                spark={card.decay.spark}
              />
            ) : null}
          </div>
        )}
      </Card>
    </div>
  );
}

function EquipmentCockpit({
  card,
  locale,
  onRetry,
}: {
  card: HubEquipmentCard;
  locale: Locale;
  onRetry: () => void;
}) {
  return (
    <div data-testid="hub-equipment" data-status={card.status}>
      <Card variant="raised" title={tAnalysis(locale, "analysis.hub.cockpit.equipment")}>
        {card.status === "loading" ? (
          <p role="status">{tAnalysis(locale, "analysis.hub.preparing")}</p>
        ) : card.status === "error" ? (
          <LaneError
            message={tAnalysis(locale, "analysis.hub.error.equipment")}
            retryLabel={tAnalysis(locale, "analysis.hub.retry.equipment")}
            onRetry={onRetry}
          />
        ) : card.status === "empty" ? (
          <EmptyLane
            body={tAnalysis(locale, "analysis.hub.empty.equipment")}
            cta={tAnalysis(locale, "analysis.hub.empty.cta.equipment")}
            to={TOOL_ROUTE.equipment}
          />
        ) : (
          <div className="grid gap-1">
            <p className="font-semibold text-brand-navy">{equipmentSummary(card.symptomKey, card.symptomText, locale)}</p>
            <p>{formatWhen(locale, card.createdAt)}</p>
          </div>
        )}
      </Card>
    </div>
  );
}

function ToolCard({
  title,
  to,
  tool,
  locale,
  errorKey,
}: {
  title: string;
  to: string;
  tool: HubTool;
  locale: Locale;
  errorKey: AnalysisMessageKey;
}) {
  const line =
    tool.status === "loading"
      ? tAnalysis(locale, "analysis.hub.preparing")
      : tool.status === "error"
        ? tAnalysis(locale, errorKey)
        : tool.status === "empty"
          ? tAnalysis(locale, "analysis.hub.lastUsed.empty")
          : tAnalysis(locale, "analysis.hub.lastUsed", {
              date: formatWhen(locale, tool.createdAt),
              value: headline(tool.item, locale),
            });
  return (
    <Link to={to} className="grid min-h-11 gap-2 rounded-card border border-brand-navy/10 bg-white p-4 shadow-card" data-status={tool.status}>
      <StatusTag tone="brand">{title}</StatusTag>
      <p className="text-sm text-brand-navy/80">{line}</p>
    </Link>
  );
}

function RecentList({ recent, locale }: { recent: ReturnType<typeof buildHubModel>["recent"]; locale: Locale }) {
  return (
    <section className="grid gap-3" data-testid="hub-recent" data-status={recent.status}>
      <h2 className="text-lg font-bold text-brand-navy">{tAnalysis(locale, "analysis.hub.recent.title")}</h2>
      {recent.status === "loading" ? (
        <p role="status" className="text-sm text-brand-navy/80">
          {tAnalysis(locale, "analysis.hub.preparing")}
        </p>
      ) : recent.status === "empty" ? (
        <p className="text-sm text-brand-navy/80">{tAnalysis(locale, "analysis.hub.recent.empty")}</p>
      ) : (
        <>
          {recent.status === "error" ? (
            <ErrorNotice>{tAnalysis(locale, "analysis.hub.recent.blocked")}</ErrorNotice>
          ) : null}
          <ul className="grid gap-2">
            {recent.items.map((item) => (
              <li key={`${item.kind}:${item.id}`}>
                <Link
                  to={TOOL_ROUTE[item.kind]}
                  className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-card border border-brand-navy/10 bg-white p-3"
                >
                  <StatusTag tone="brand">{tAnalysis(locale, stickerKey(item.kind))}</StatusTag>
                  <span className="text-sm text-brand-navy/80">{formatWhen(locale, item.createdAt)}</span>
                  <span className="sx-numeric text-lg text-brand-flame">{headline(item, locale)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
