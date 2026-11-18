/**
 * Safety policy shape for ADR-021.
 * status and policyVersion follow the trainingCatalogSafetyPolicies rule
 * (firestore.rules: client writes stay on draft, and policyVersion is fixed
 * after create). Applicability and rule conditions are the evaluation fields.
 * Validation rejects a document that cannot be used. It does not publish one.
 */

export const SAFETY_AGE_BANDS = ["age8_10", "age11_13", "age14_16"] as const;

export type SafetyAgeBand = (typeof SAFETY_AGE_BANDS)[number];

export const SAFETY_LOADS = ["low", "moderate", "high"] as const;

export type SafetyLoad = (typeof SAFETY_LOADS)[number];

export interface SafetyObjectCondition {
  objectId: string;
  minTrainingAgeYears?: number;
  requiredSkills?: readonly string[];
  allowedLoads?: readonly SafetyLoad[];
}

export interface SafetyPolicy {
  policyId: string;
  policyVersion: string;
  status: "published";
  objectIds: readonly string[];
  ageBands: readonly SafetyAgeBand[];
  blockingRestrictions: readonly string[];
  blockingRecoveryFlags: readonly string[];
  knownRestrictions: readonly string[];
  knownRecoveryFlags: readonly string[];
  objectConditions?: readonly SafetyObjectCondition[];
  reviewStatus: "approved";
  reviewer: string;
  reviewedAt: string;
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

function rejected(policyVersion: string | null, detail: string): ParsedSafetyPolicy {
  return { ok: false, policyVersion, detail };
}

function parseableDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function covers(known: readonly string[], used: readonly string[]): boolean {
  return used.every((item) => known.includes(item));
}

function parseObjectConditions(value: unknown): readonly SafetyObjectCondition[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  const conditions: SafetyObjectCondition[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !nonEmptyString(entry.objectId)) return null;
    const condition: SafetyObjectCondition = { objectId: entry.objectId.trim() };
    if (entry.minTrainingAgeYears !== undefined) {
      const age = entry.minTrainingAgeYears;
      if (typeof age !== "number" || !Number.isInteger(age) || age < 0) return null;
      condition.minTrainingAgeYears = age;
    }
    if (entry.requiredSkills !== undefined) {
      const skills = stringList(entry.requiredSkills, true);
      if (skills === null) return null;
      condition.requiredSkills = skills;
    }
    if (entry.allowedLoads !== undefined) {
      const loads = stringList(entry.allowedLoads, true);
      if (loads === null || loads.some((load) => !(SAFETY_LOADS as readonly string[]).includes(load))) return null;
      condition.allowedLoads = loads as SafetyLoad[];
    }
    conditions.push(condition);
  }
  return conditions;
}

export function parseSafetyPolicy(raw: unknown): ParsedSafetyPolicy {
  const policyVersion = policyVersionOf(raw);
  if (!isRecord(raw)) return rejected(policyVersion, "policy must be an object");
  const objectIds = stringList(raw.objectIds, false);
  const ageBands = stringList(raw.ageBands, false);
  const blockingRestrictions = stringList(raw.blockingRestrictions, true);
  const blockingRecoveryFlags = stringList(raw.blockingRecoveryFlags, true);
  const knownRestrictions = stringList(raw.knownRestrictions, true);
  const knownRecoveryFlags = stringList(raw.knownRecoveryFlags, true);
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
    knownRestrictions === null ||
    knownRecoveryFlags === null ||
    reviewStatus !== "approved" ||
    typeof reviewer !== "string" ||
    typeof reviewedAt !== "string" ||
    !parseableDate(reviewedAt)
  ) {
    return rejected(policyVersion, "safety policy is missing a required field or is not published");
  }
  if (!covers(knownRestrictions, blockingRestrictions)) {
    return rejected(policyVersion, "blocking restriction is not a known restriction");
  }
  if (!covers(knownRecoveryFlags, blockingRecoveryFlags)) {
    return rejected(policyVersion, "blocking recovery flag is not a known recovery flag");
  }
  const objectConditions = parseObjectConditions(raw.objectConditions);
  if (objectConditions === null) return rejected(policyVersion, "object conditions are invalid");
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
      knownRestrictions,
      knownRecoveryFlags,
      ...(objectConditions !== undefined ? { objectConditions } : {}),
      reviewStatus: "approved",
      reviewer,
      reviewedAt,
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
