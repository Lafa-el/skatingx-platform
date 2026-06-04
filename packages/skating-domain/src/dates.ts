import type { DateString } from "@skatingx/schema";

export function todayDateString(date = new Date()): DateString {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function previousDateString(dateStr: DateString): DateString {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return todayDateString(dt);
}

export function compareDateStrings(a: DateString, b: DateString): number {
  return a.localeCompare(b);
}
