/** ISO 8601 date (calendar day), e.g. 2026-06-03 */
export type DateString = string;

/**
 * Serializable instant for API and future Firestore mapping.
 * Prefer ISO 8601 strings in client code until repositories are wired.
 */
export type Timestamp = string;

/** Audit metadata when a document originated from a legacy app. */
export interface LegacySource {
  appId?: string;
  projectId?: string;
  documentPath?: string;
  migratedAt?: Timestamp;
}
