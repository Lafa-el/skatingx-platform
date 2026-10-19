/**
 * Display formatting for decimals. A number input can surface a float32 value
 * such as 7.050000190734863; the screen shows the rounded text instead.
 */

const NOISY_DECIMAL = /^-?\d+\.\d{6,}(?:e[+-]?\d+)?$/i;

export function formatFixed(value: number, digits: number): string {
  if (!Number.isFinite(value)) return "";
  return value.toFixed(digits);
}

/** Leave ordinary typing alone. Collapse only the long float32 tail. */
export function formatDecimalDisplay(raw: string): string {
  const trimmed = raw.trim();
  if (!NOISY_DECIMAL.test(trimmed)) return raw;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return raw;
  const rounded = Number(value.toFixed(2));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}
