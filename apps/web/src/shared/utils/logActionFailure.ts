/**
 * Developer-facing context for an action that failed after the page already told the user: the
 * area, the operation and an error code only. An error message can carry a document path or text
 * the user typed, so it is never logged (AGENTS.md: no secrets or user content in logs).
 */
export function logActionFailure(area: string, operation: string, error: unknown): void {
  const code =
    typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "none";
  console.error(`[${area}] ${operation} failed`, { code });
}
