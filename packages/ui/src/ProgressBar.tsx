import { normalizeProgress } from "./progress";

type ProgressBarProps = {
  value: number;
  /** Defaults to 100, so `value` reads as a percentage. */
  max?: number;
  /** What is being measured. Screen readers get the bar by this name, so it is required. */
  label: string;
  className?: string;
};

/**
 * The fill is solid flame, not the flame-to-energy gradient of the mock-up: the energy end is
 * about 1.8:1 against the track, so where the fill stops could not be seen. Flame on the track is 3.09:1.
 */
export function ProgressBar({ value, max = 100, label, className = "" }: ProgressBarProps) {
  const progress = normalizeProgress(value, max);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={progress.max}
      aria-valuenow={progress.value}
      className={`h-2.5 w-full overflow-hidden rounded-full bg-brand-track ring-1 ring-inset ring-brand-navy/10 ${className}`.trim()}
    >
      <div
        className="h-full rounded-full bg-brand-flame transition-[width] motion-reduce:transition-none"
        style={{ width: `${progress.fraction * 100}%` }}
      />
    </div>
  );
}
