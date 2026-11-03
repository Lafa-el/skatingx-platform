import type { DateString } from "@skatingx/schema";

export type AthleteAgeLocale = "zh" | "en";

type CalendarDay = { year: number; month: number; day: number };

/**
 * `new Date("YYYY-MM-DD")` is UTC midnight, which is the previous evening in the US.
 * Split the parts and build a local date so the calendar day stays the one that was stored.
 */
function parseCalendarDay(value: string): CalendarDay | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const local = new Date(year, month - 1, day);
  if (local.getFullYear() !== year || local.getMonth() !== month - 1 || local.getDate() !== day) {
    return null;
  }
  return { year, month, day };
}

/** Age in whole years. The birthday itself is the day the age increases. */
export function getRealAge(birthDate: DateString, today: DateString): number | null {
  const birth = parseCalendarDay(birthDate);
  const now = parseCalendarDay(today);
  if (!birth || !now) {
    return null;
  }
  let age = now.year - birth.year;
  if (now.month < birth.month || (now.month === birth.month && now.day < birth.day)) {
    age -= 1;
  }
  return age;
}

/**
 * Season age used by the old journal dashboard.
 * Season start year is this year on or after 1 July, otherwise last year.
 * A birthday in January–June uses seasonStart − birth year; July–December subtracts one more.
 */
export function getSkatingAge(birthDate: DateString, today: DateString): number | null {
  const birth = parseCalendarDay(birthDate);
  const now = parseCalendarDay(today);
  if (!birth || !now) {
    return null;
  }
  const seasonStartYear = now.month > 7 || (now.month === 7 && now.day >= 1) ? now.year : now.year - 1;
  const bornBeforeJuly = birth.month <= 6;
  return seasonStartYear - birth.year - (bornBeforeJuly ? 0 : 1);
}

const AGE_CATEGORIES: ReadonlyArray<{ max: number; zh: string; en: string }> = [
  { max: 6, zh: "初级前", en: "Pre-Novice" },
  { max: 8, zh: "少年F（7/8岁）", en: "Junior F (7/8)" },
  { max: 10, zh: "少年E（9/10岁）", en: "Junior E (9/10)" },
  { max: 12, zh: "少年D（11/12岁）", en: "Junior D (11/12)" },
  { max: 14, zh: "少年C（13/14岁）", en: "Junior C (13/14)" },
  { max: 16, zh: "少年B（15/16岁）", en: "Junior B (15/16)" },
  { max: 18, zh: "少年A（17/18岁）", en: "Junior A (17/18)" },
  { max: Number.POSITIVE_INFINITY, zh: "高级（18岁以上）", en: "Senior (18+)" },
];

/** Category for a skating age. 18 is still Junior A; 19 and above is Senior. */
export function getAgeCategory(skatingAge: number, locale: AthleteAgeLocale = "zh"): string | null {
  if (!Number.isInteger(skatingAge)) {
    return null;
  }
  const band = AGE_CATEGORIES.find((item) => skatingAge <= item.max);
  return band ? band[locale] : null;
}

export type SkatingDuration = { years: number; months: number; days: number };

/**
 * Calendar difference, borrowing days from the previous month and months from the previous year.
 * Same arithmetic as the old journal dashboard, on local calendar parts.
 */
export function getSkatingDuration(startDate: DateString, today: DateString): SkatingDuration | null {
  const start = parseCalendarDay(startDate);
  const now = parseCalendarDay(today);
  if (!start || !now) {
    return null;
  }
  let years = now.year - start.year;
  let months = now.month - start.month;
  let days = now.day - start.day;
  if (days < 0) {
    days += new Date(now.year, now.month - 1, 0).getDate();
    months -= 1;
  }
  if (months < 0) {
    months += 12;
    years -= 1;
  }
  return { years, months, days };
}

/** English plurals follow the old site: "year" unless the count is greater than 1; "month"/"day" only for 1. */
export function formatSkatingDuration(duration: SkatingDuration, locale: AthleteAgeLocale): string {
  if (locale === "zh") {
    return `${String(duration.years)} 年 ${String(duration.months)} 个月 ${String(duration.days)} 天`;
  }
  const yearWord = duration.years > 1 ? "years" : "year";
  const monthWord = duration.months !== 1 ? "months" : "month";
  const dayWord = duration.days !== 1 ? "days" : "day";
  return `${String(duration.years)} ${yearWord} ${String(duration.months)} ${monthWord} ${String(duration.days)} ${dayWord}`;
}
