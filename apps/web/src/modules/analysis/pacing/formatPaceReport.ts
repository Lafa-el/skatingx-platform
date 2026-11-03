import { formatResultTime, type PaceAnalysis, type PaceDistance } from "@skatingx/skating-domain";

import type { Locale } from "@/shared/i18n/translator";
import { paceFocus, tPace } from "@/shared/i18n/pacing-messages";

const adviceKey = {
  需强化: "pace.advice.reinforce",
  稳定中等: "pace.advice.steady",
  优秀: "pace.advice.excellent",
} as const;

/** The legacy report sentence, with numbers filled in. Wording comes from the pacing resources. */
export function formatPaceReport(
  locale: Locale,
  distance: PaceDistance,
  labels: readonly string[],
  analysis: PaceAnalysis,
): string {
  const title = tPace(locale, "pace.chart.title", { distance: `${distance}m` });
  const gap = analysis.totalSeconds - analysis.benchmarkTotalSeconds;
  const body = tPace(locale, "pace.report.body", {
    title,
    pattern: labels.join(" / "),
    total: formatResultTime(analysis.totalSeconds),
    gapWord: tPace(locale, gap === 0 ? "pace.report.even" : gap > 0 ? "pace.report.slower" : "pace.report.faster"),
    gap: formatResultTime(Math.abs(gap)),
    early: formatResultTime(analysis.earlyAverageSeconds),
    late: formatResultTime(analysis.lateAverageSeconds),
    decay: analysis.decayPercent.toFixed(1),
    benchmarkDecay: analysis.benchmarkDecayPercent.toFixed(1),
  });
  const advice =
    analysis.ratingLabel === "优秀"
      ? tPace(locale, adviceKey[analysis.ratingLabel])
      : tPace(locale, adviceKey[analysis.ratingLabel], {
          focus: paceFocus(locale, distance),
          title,
        });
  return `${body}${advice}`;
}
