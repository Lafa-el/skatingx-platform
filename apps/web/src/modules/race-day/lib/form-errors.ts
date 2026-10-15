import type { RaceDayInputError, RaceDayInputErrorCode } from "@skatingx/skating-domain";

import type { RaceDayMessageKey } from "../i18n/messages";

const KEY: Record<RaceDayInputErrorCode, RaceDayMessageKey> = {
  required: "raceDay.form.error.required",
  tooLong: "raceDay.form.error.tooLong",
  tooMany: "raceDay.form.error.tooMany",
  invalidFormat: "raceDay.form.error.invalidFormat",
  outOfRange: "raceDay.form.error.outOfRange",
  duplicate: "raceDay.form.error.duplicate",
};

/** First error per field, as a message key. A field shows one problem at a time. */
export function fieldErrorKeys(errors: readonly RaceDayInputError[]): Map<string, RaceDayMessageKey> {
  const out = new Map<string, RaceDayMessageKey>();
  for (const error of errors) {
    if (!out.has(error.field)) {
      out.set(error.field, KEY[error.code]);
    }
  }
  return out;
}
