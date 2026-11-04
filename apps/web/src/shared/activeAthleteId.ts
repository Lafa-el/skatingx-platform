/** A stored id. Missing and blank are the same: there is no current athlete. */
export function activeAthleteIdOf(
  settings: { activeAthleteId?: string } | null | undefined,
): string | null {
  const id = settings?.activeAthleteId;
  return typeof id === "string" && id.length > 0 ? id : null;
}
