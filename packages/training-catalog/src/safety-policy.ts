/**
 * Safety policy shape for ADR-021.
 * status and policyVersion follow the trainingCatalogSafetyPolicies rule
 * (firestore.rules: client writes stay on draft, and policyVersion is fixed
 * after create). Applicability and rule conditions are the evaluation fields.
 * Validation rejects a document that cannot be used. It does not publish one.
 */

export const SAFETY_AGE_BANDS = ["age8_10", "age11_13", "age14_16"] as const;

export type SafetyAgeBand = (typeof SAFETY_AGE_BANDS)[number];

export interface SafetyPolicy {
  policyId: string;
  policyVersion: string;
  status: "published";
  objectIds: readonly string[];
  ageBands: readonly SafetyAgeBand[];
  blockingRestrictions: readonly string[];
  blockingRecoveryFlags: readonly string[];
  reviewStatus?: string;
  reviewer?: string;
  reviewedAt?: string;
}

export type ParsedSafetyPolicy =
  | { ok: true; policy: SafetyPolicy }
  | { ok: false; policyVersion: string | null; detail: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export function policyVersionOf(raw: unknown): string | null {
  if (!isRecord(raw) || !nonEmptyString(raw.policyVersion)) return null;
  return raw.policyVersion.trim();
}

function stringList(value: unknown, allowEmpty: boolean): readonly string[] | null {
  if (!Array.isArray(value) || value.some((item) => !nonEmptyString(item))) return null;
  const list = value.map((item) => item.trim());
  if (!allowEmpty && list.length === 0) return null;
  if (list.includes("*")) return null;
  return list;
}

function optionalText(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return nonEmptyString(value) ? value.trim() : null;
}

export function parseSafetyPolicy(raw: unknown): ParsedSafetyPolicy {
  const policyVersion = policyVersionOf(raw);
  if (!isRecord(raw)) {
    return { ok: false, policyVersion, detail: "policy must be an object" };
  }
  const objectIds = stringList(raw.objectIds, false);
  const ageBands = stringList(raw.ageBands, false);
  const blockingRestrictions = stringList(raw.blockingRestrictions, true);
  const blockingRecoveryFlags = stringList(raw.blockingRecoveryFlags, true);
  const reviewStatus = optionalText(raw.reviewStatus);
  const reviewer = optionalText(raw.reviewer);
  const reviewedAt = optionalText(raw.reviewedAt);
  const bandsOk = ageBands !== null && ageBands.every((band) => (SAFETY_AGE_BANDS as readonly string[]).includes(band));
  if (
    raw.status !== "published" ||
    !nonEmptyString(raw.policyId) ||
    policyVersion === null ||
    objectIds === null ||
    !bandsOk ||
    ageBands === null ||
    blockingRestrictions === null ||
    blockingRecoveryFlags === null ||
    reviewStatus === null ||
    reviewer === null ||
    reviewedAt === null
  ) {
    return { ok: false, policyVersion, detail: "safety policy is missing a required field or is not published" };
  }
  return {
    ok: true,
    policy: {
      policyId: raw.policyId.trim(),
      policyVersion,
      status: "published",
      objectIds,
      ageBands: ageBands as SafetyAgeBand[],
      blockingRestrictions,
      blockingRecoveryFlags,
      ...(reviewStatus !== undefined ? { reviewStatus } : {}),
      ...(reviewer !== undefined ? { reviewer } : {}),
      ...(reviewedAt !== undefined ? { reviewedAt } : {}),
    },
  };
}

/** Rejects an unusable policy. Callers that must keep going use parseSafetyPolicy. */
export function validateSafetyPolicy(raw: unknown): SafetyPolicy {
  const parsed = parseSafetyPolicy(raw);
  if (!parsed.ok) {
    throw new Error(`safety policy rejected: ${parsed.detail}`);
  }
  return parsed.policy;
}
