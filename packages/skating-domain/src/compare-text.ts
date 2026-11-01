/**
 * Code-unit order, so the same ids sort the same way on every device and locale.
 * Used wherever several "self" roster rows must pick one winner.
 */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
