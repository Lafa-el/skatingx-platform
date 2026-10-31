import {
  buildPaceAnalysisRecord,
  calculatePacingAnalysis,
  pacingDistanceConfigs,
  type PaceAnalysis,
  type PaceDistance,
} from "@skatingx/skating-domain";
import { getFirestoreDb, savePaceAnalysisRecord } from "@skatingx/firebase-client";
import { Button, Card, ErrorNotice, Notice } from "@skatingx/ui";
import { useMemo, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useLocale } from "@/hooks/useLocale";
import { tAnalysis } from "@/shared/i18n/analysis-messages";
import { paceSegmentLabel, tPace, type PaceMessageKey } from "@/shared/i18n/pacing-messages";
import { logActionFailure } from "@/shared/utils/logActionFailure";

import { formatPaceReport } from "./formatPaceReport";
import { PacingChart } from "./PacingChart";

const DISTANCES = ["500", "777", "1000"] as const satisfies readonly PaceDistance[];

const inputErrorKey = {
  "请输入完整且大于 0 的圈速数据后再生成曲线。": "pace.error.splits",
  "请先填写完整且大于 0 的 Junior D 标准，再生成曲线。": "pace.error.benchmark",
} as const satisfies Record<string, PaceMessageKey>;

const ratingKey = {
  优秀: "pace.rating.excellent",
  需强化: "pace.rating.reinforce",
  稳定中等: "pace.rating.steady",
} as const satisfies Record<PaceAnalysis["ratingLabel"], PaceMessageKey>;

const levelKey = {
  优秀: "pace.level.excellent",
  需强化: "pace.level.reinforce",
  稳定中等: "pace.level.steady",
} as const satisfies Record<PaceAnalysis["ratingLabel"], PaceMessageKey>;

function blankSplits(distance: PaceDistance): string[] {
  return pacingDistanceConfigs[distance].labels.map(() => "");
}

function defaultBenchmark(distance: PaceDistance): string[] {
  return pacingDistanceConfigs[distance].defaults.map((value) => value.toFixed(2));
}

function readNumber(raw: string): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

export function PacingPage() {
  const locale = useLocale();
  const { uid } = useAuth();
  const [distance, setDistance] = useState<PaceDistance>("500");
  const [athleteText, setAthleteText] = useState(() => blankSplits("500"));
  const [benchmarkText, setBenchmarkText] = useState(() => defaultBenchmark("500"));
  const [analysis, setAnalysis] = useState<PaceAnalysis | null>(null);
  const [chartAthlete, setChartAthlete] = useState<number[] | null>(null);
  // Snapshot taken at generate time, like `analysis` and `chartAthlete`: editing a benchmark box
  // changes nothing on screen or in a saved record until the next generate.
  const [chartBenchmark, setChartBenchmark] = useState<number[] | null>(null);
  const [inputError, setInputError] = useState<PaceMessageKey | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saved" | PaceMessageKey>("idle");
  const [saving, setSaving] = useState(false);

  const labels = useMemo(
    () => pacingDistanceConfigs[distance].labels.map((_, index) => paceSegmentLabel(locale, distance, index)),
    [locale, distance],
  );

  const switchDistance = (next: PaceDistance) => {
    setDistance(next);
    setAthleteText(blankSplits(next));
    setBenchmarkText(defaultBenchmark(next));
    setAnalysis(null);
    setChartAthlete(null);
    setChartBenchmark(null);
    setInputError(null);
    setSaveState("idle");
  };

  const generate = () => {
    const splits = athleteText.map(readNumber);
    const benchmark = benchmarkText.map(readNumber);
    const result = calculatePacingAnalysis(distance, splits, benchmark);
    setSaveState("idle");
    if (!result.ok) {
      setAnalysis(null);
      setChartAthlete(null);
      setChartBenchmark(null);
      setInputError(inputErrorKey[result.message]);
      return;
    }
    setInputError(null);
    setAnalysis(result.analysis);
    setChartAthlete(splits);
    setChartBenchmark(benchmark);
  };

  const save = async () => {
    if (!analysis || !chartAthlete || !chartBenchmark) {
      return;
    }
    if (!uid) {
      setSaveState("pace.error.signedOut");
      return;
    }
    const db = getFirestoreDb();
    if (!db) {
      setSaveState("pace.error.unavailable");
      return;
    }
    setSaving(true);
    try {
      const record = buildPaceAnalysisRecord({
        id: `pace-${distance}-${crypto.randomUUID()}`,
        ownerUserId: uid,
        createdAt: new Date().toISOString(),
        distance,
        splits: chartAthlete,
        benchmark: chartBenchmark,
        analysis,
      });
      await savePaceAnalysisRecord(db, record);
      setSaveState("saved");
    } catch (error) {
      logActionFailure("analysis", "save-pace", error);
      setSaveState("pace.error.save");
    } finally {
      setSaving(false);
    }
  };

  const report = analysis ? formatPaceReport(locale, distance, labels, analysis) : tPace(locale, "pace.empty");

  return (
    <section className="grid gap-4 lg:grid-cols-12">
      <div className="lg:col-span-4">
        <h1 className="text-2xl font-bold text-brand-navy">{tAnalysis(locale, "analysis.pacing.title")}</h1>
        <h2 className="mt-3 text-lg font-bold text-brand-navy">{tPace(locale, "pace.intro.title")}</h2>
        <p className="mt-1 text-sm text-brand-navy/80">{tPace(locale, "pace.intro.body")}</p>

        <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label={tPace(locale, "pace.distance.group")}>
          {DISTANCES.map((item) => (
            <Button
              key={item}
              variant={item === distance ? "brand" : "outline"}
              className="w-full"
              aria-pressed={item === distance}
              onClick={() => switchDistance(item)}
            >
              {tPace(locale, `pace.distance.${item}`)}
            </Button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {labels.map((label, index) => {
            const id = `pace-athlete-${distance}-${index}`;
            return (
              <div key={id}>
                <label htmlFor={id} className="mb-1 block text-sm font-semibold text-brand-navy">
                  {tPace(locale, "pace.input.unit", { label })}
                </label>
                <input
                  id={id}
                  inputMode="decimal"
                  value={athleteText[index] ?? ""}
                  onChange={(event) =>
                    setAthleteText((current) => current.map((value, i) => (i === index ? event.target.value : value)))
                  }
                  className="min-h-11 w-full rounded-control border border-brand-navy/30 bg-white px-3 font-mono text-brand-navy"
                />
              </div>
            );
          })}
        </div>

        <Button className="mt-4 w-full" onClick={generate}>
          {tPace(locale, "pace.action.generate")}
        </Button>
        {inputError ? (
          <ErrorNotice className="mt-3">{tPace(locale, inputError)}</ErrorNotice>
        ) : null}
      </div>

      <div className="space-y-4 lg:col-span-8">
        <Card title={tPace(locale, "pace.chart.title", { distance: `${distance}m` })}>
          <p className="font-mono text-xs text-brand-navy">{tPace(locale, "pace.badge")}</p>
          <div className="mt-3">
            {chartAthlete && chartBenchmark ? (
              <PacingChart
                labels={labels}
                benchmark={chartBenchmark}
                athlete={chartAthlete}
                benchmarkLabel={tPace(locale, "pace.chart.benchmark")}
                athleteLabel={tPace(locale, "pace.chart.athlete")}
                axisLabel={tPace(locale, "pace.chart.axis")}
                fallbackLines={labels.map((label, index) =>
                  tPace(locale, "pace.chart.fallbackLine", {
                    label,
                    benchmarkName: tPace(locale, "pace.chart.canvasBenchmark"),
                    benchmark: chartBenchmark[index]?.toFixed(2) ?? "--",
                    athleteName: tPace(locale, "pace.chart.canvasAthlete"),
                    athlete: chartAthlete[index]?.toFixed(2) ?? "--",
                  }),
                )}
              />
            ) : (
              <Notice tone="info">{tPace(locale, "pace.chart.waiting")}</Notice>
            )}
          </div>

          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-brand-navy">{tPace(locale, "pace.benchmark.heading")}</h3>
              <Button
                variant="outline"
                onClick={() => setBenchmarkText(defaultBenchmark(distance))}
              >
                {tPace(locale, "pace.action.resetBenchmark")}
              </Button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              {labels.map((label, index) => {
                const id = `pace-benchmark-${distance}-${index}`;
                return (
                  <div key={id}>
                    <label htmlFor={id} className="mb-1 block text-sm font-semibold text-brand-navy">
                      {label}
                    </label>
                    <input
                      id={id}
                      inputMode="decimal"
                      value={benchmarkText[index] ?? ""}
                      onChange={(event) =>
                        setBenchmarkText((current) =>
                          current.map((value, i) => (i === index ? event.target.value : value)),
                        )
                      }
                      className="min-h-11 w-full rounded-control border border-brand-navy/30 bg-white px-3 font-mono text-brand-navy"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        <div className="grid gap-3 md:grid-cols-3">
          <Card title={tPace(locale, "pace.metric.stability")}>
            <p className="text-2xl font-bold text-brand-navy">
              {analysis ? `${analysis.lacticIndexPercent}%` : "--%"}
            </p>
            <p className="mt-1 text-xs text-brand-navy/70">{tPace(locale, "pace.metric.stabilityHint")}</p>
          </Card>
          <Card title={tPace(locale, "pace.metric.rating")}>
            <p className="text-2xl font-bold text-brand-navy">
              {analysis ? tPace(locale, ratingKey[analysis.ratingLabel]) : tPace(locale, "pace.metric.waiting")}
            </p>
            <p className="mt-1 text-xs text-brand-navy/70">
              {analysis ? tPace(locale, levelKey[analysis.ratingLabel]) : "--"}
            </p>
          </Card>
          <Card title={tPace(locale, "pace.metric.ratio")}>
            <p className="text-2xl font-bold text-brand-navy">{analysis ? analysis.trainingRatio : "--"}</p>
            <p className="mt-1 text-xs text-brand-navy/70">{tPace(locale, "pace.metric.ratioHint")}</p>
          </Card>
        </div>

        <Card title={tPace(locale, "pace.report.heading")}>
          <p className="text-sm leading-relaxed text-brand-navy">{report}</p>
        </Card>

        <Button className="w-full md:w-auto" disabled={!analysis || saving} onClick={() => void save()}>
          {tPace(locale, "pace.action.save")}
        </Button>
        {saveState === "saved" ? (
          <Notice tone="success" role="status" className="mt-3">
            {tPace(locale, "pace.saved")}
          </Notice>
        ) : null}
        {saveState !== "idle" && saveState !== "saved" ? (
          <ErrorNotice className="mt-3">{tPace(locale, saveState)}</ErrorNotice>
        ) : null}
      </div>
    </section>
  );
}
