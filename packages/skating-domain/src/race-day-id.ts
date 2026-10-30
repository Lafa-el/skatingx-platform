/**
 * Ids are lowercase letters, digits and hyphens. Underscore is excluded on purpose: it is the
 * separator in `createRaceResultId`, so a composed id can always be split back unambiguously.
 *
 * Its own module so code that only needs to recognise an id (the records page) does not pull the
 * rest of Race Day into the main bundle.
 */
const RACE_DAY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ID_LENGTH = 64;

export function isValidRaceDayId(id: string): boolean {
  return id.length > 0 && id.length <= MAX_ID_LENGTH && RACE_DAY_ID_PATTERN.test(id);
}
