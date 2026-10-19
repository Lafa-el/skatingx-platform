import { useEffect, useRef, useState } from "react";

type PaceChartProps = {
  labels: readonly string[];
  benchmark: readonly number[];
  athlete: readonly number[];
  benchmarkLabel: string;
  athleteLabel: string;
  axisLabel: string;
  fallbackLines: readonly string[];
};

/**
 * chart.js 4.5.1 (MIT), pinned in @skatingx/web. The legacy page loaded this same
 * release from a CDN. Here it is bundled and imported only when a curve exists,
 * so it stays out of the first-screen chunk. If the import fails, the numbers
 * are listed in text instead of a blank chart.
 */
export function PacingChart({
  labels,
  benchmark,
  athlete,
  benchmarkLabel,
  athleteLabel,
  axisLabel,
  fallbackLines,
}: PaceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);
  const dataKey = JSON.stringify({ labels, benchmark, athlete, benchmarkLabel, athleteLabel, axisLabel });

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    let chart: { destroy: () => void } | null = null;
    let cancelled = false;
    setFallback(false);

    void import("chart.js")
      .then((chartjs) => {
        if (cancelled) {
          return;
        }
        chartjs.Chart.register(
          chartjs.LineController,
          chartjs.LineElement,
          chartjs.PointElement,
          chartjs.LinearScale,
          chartjs.CategoryScale,
          chartjs.Legend,
          chartjs.Tooltip,
          chartjs.Filler,
        );
        chart = new chartjs.Chart(context, {
          type: "line",
          data: {
            labels: [...labels],
            datasets: [
              {
                label: benchmarkLabel,
                data: [...benchmark],
                borderColor: "rgba(8, 28, 51, 0.55)",
                borderDash: [5, 5],
                backgroundColor: "transparent",
                borderWidth: 2,
                tension: 0.3,
              },
              {
                label: athleteLabel,
                data: [...athlete],
                borderColor: "#ff3e2c",
                backgroundColor: "rgba(255, 62, 44, 0.12)",
                fill: true,
                borderWidth: 3,
                tension: 0.3,
                pointRadius: 5,
                pointBackgroundColor: "#ff3e2c",
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { labels: { color: "#081c33", font: { size: 12 } } },
            },
            scales: {
              y: {
                title: { display: true, text: axisLabel, color: "#081c33" },
                ticks: { color: "#081c33" },
              },
              x: { ticks: { color: "#081c33" } },
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          setFallback(true);
        }
      });

    return () => {
      cancelled = true;
      chart?.destroy();
    };
  }, [dataKey, labels, benchmark, athlete, benchmarkLabel, athleteLabel, axisLabel]);

  if (fallback) {
    return (
      <ul className="text-sm text-brand-navy">
        {fallbackLines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    );
  }

  return (
    <div className="relative h-64 w-full">
      <canvas ref={canvasRef} role="img" aria-label={axisLabel} />
    </div>
  );
}
