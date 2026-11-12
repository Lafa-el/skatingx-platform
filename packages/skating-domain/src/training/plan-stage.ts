/**
 * Real age, in whole years, to an academy stage id.
 * Outside 4–18, or no age, there is no stage: the plan shows the birth-date prompt and generates nothing.
 */
export function stageIdForRealAge(age: number | null): string | null {
  if (age === null || !Number.isInteger(age)) return null;
  if (age >= 4 && age <= 7) return "age4_7";
  if (age >= 8 && age <= 10) return "age8_10";
  if (age >= 11 && age <= 13) return "age11_13";
  if (age >= 14 && age <= 16) return "age14_16";
  if (age >= 17 && age <= 18) return "age17_18";
  return null;
}
