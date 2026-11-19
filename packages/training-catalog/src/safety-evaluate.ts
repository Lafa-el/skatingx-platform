/**
 * Youth safety evaluation (ADR-021). Pure: no Firestore and no network.
 *
 * ageBand selects whether a policy applies. It does not decide maturity,
 * skill, or the allow / allow_with_supervision split. That split follows the
 * four Conditional exercise ids. Missing data and a missing policy stay
 * review_required or block.
 */

import {
  SAFETY_AGE_BANDS,
  SAFETY_LOADS,
  parseSafetyPolicy,
  policyVersionOf,
  type SafetyAgeBand,
  type SafetyLoad,
  type SafetyPolicy,
} from "./safety-policy";

export { SAFETY_LOADS, type SafetyLoad };

export const SAFETY_DECISIONS = [
  "allow",
  "allow_with_supervision",
  "review_required",
  "block",
] as const;

export type SafetyDecision = (typeof SAFETY_DECISIONS)[number];

/** ADR-021 Conditional exercises. A satisfied policy yields allow_with_supervision. */
export const CONDITIONAL_SAFETY_OBJECT_IDS = ["EX-L039", "EX-L078", "EX-L079", "EX-L080"] as const;

export interface SafetyEvaluationInput {
  objectId: string;
  ageBand?: unknown;
  trainingAge?: unknown;
  verifiedSkills?: unknown;
  recentLoad?: unknown;
  recoveryFlags?: unknown;
  supervision?: unknown;
  authorizedRestrictions?: unknown;
}

export interface SafetySupervision {
  qualified: boolean;
  present: boolean;
}

export interface SafetyEvaluation {
  decision: SafetyDecision;
  reasonCodes: readonly string[];
  policyVersion: string | null;
}

function closed(
  decision: SafetyDecision,
  reasonCodes: readonly string[],
  policyVersion: string | null,
): SafetyEvaluation {
  return { decision, reasonCodes, policyVersion };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) return null;
  return value.map((item) => item.trim());
}

function knownAgeBand(value: unknown): SafetyAgeBand | null {
  return typeof value === "string" && (SAFETY_AGE_BANDS as readonly string[]).includes(value)
    ? value as SafetyAgeBand
    : null;
}

function trainingAgeOk(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function supervisionOf(value: unknown): SafetySupervision | null {
  if (!isRecord(value)) return null;
  if (typeof value.qualified !== "boolean" || typeof value.present !== "boolean") return null;
  return { qualified: value.qualified, present: value.present };
}

function missingInputCodes(input: SafetyEvaluationInput): string[] {
  const missing: string[] = [];
  if (!trainingAgeOk(input.trainingAge)) missing.push("INPUT_MISSING:trainingAge");
  if (input.verifiedSkills === undefined || stringList(input.verifiedSkills) === null) {
    missing.push("INPUT_MISSING:verifiedSkills");
  }
  if (typeof input.recentLoad !== "string" || !(SAFETY_LOADS as readonly string[]).includes(input.recentLoad)) {
    missing.push("INPUT_MISSING:recentLoad");
  }
  if (input.recoveryFlags === undefined || stringList(input.recoveryFlags) === null) {
    missing.push("INPUT_MISSING:recoveryFlags");
  }
  if (input.supervision === undefined || supervisionOf(input.supervision) === null) {
    missing.push("INPUT_MISSING:supervision");
  }
  if (input.authorizedRestrictions === undefined || stringList(input.authorizedRestrictions) === null) {
    missing.push("INPUT_MISSING:authorizedRestrictions");
  }
  return missing;
}

function applies(policy: SafetyPolicy, objectId: string, ageBand: SafetyAgeBand): boolean {
  return policy.objectIds.includes(objectId) && policy.ageBands.includes(ageBand);
}

export function evaluateSafety(input: SafetyEvaluationInput, policy: unknown | null): SafetyEvaluation {
  if (policy === null || policy === undefined) {
    return closed("review_required", ["POLICY_MISSING"], null);
  }
  const parsed = parseSafetyPolicy(policy);
  if (!parsed.ok) {
    return closed("review_required", ["POLICY_INVALID"], policyVersionOf(policy));
  }
  const version = parsed.policy.policyVersion;
  if (input.ageBand === undefined || input.ageBand === null || input.ageBand === "") {
    return closed("review_required", ["INPUT_MISSING:ageBand"], version);
  }
  const ageBand = knownAgeBand(input.ageBand);
  if (ageBand === null || !applies(parsed.policy, input.objectId, ageBand)) {
    return closed("review_required", ["POLICY_NOT_APPLICABLE"], version);
  }

  const condition = parsed.policy.objectConditions.find((item) => item.objectId === input.objectId);
  if (condition === undefined) {
    return closed("review_required", ["OBJECT_DECISION_MISSING"], version);
  }
  if (condition.decisionMode === "blocked") {
    return closed("block", ["OBJECT_BLOCKED"], version);
  }
  if (condition.decisionMode === "manual_review_only") {
    // A determined block is visible to the reviewer. Other missing inputs are
    // not required for that check, and are not consulted on this path.
    const restrictions = stringList(input.authorizedRestrictions);
    const recovery = stringList(input.recoveryFlags);
    if (restrictions?.some((item) => parsed.policy.blockingRestrictions.includes(item))) {
      return closed("block", ["RESTRICTION_BLOCK"], version);
    }
    if (recovery?.some((item) => parsed.policy.blockingRecoveryFlags.includes(item))) {
      return closed("block", ["RECOVERY_FLAG_BLOCK"], version);
    }
    if (restrictions?.some((item) => !parsed.policy.knownRestrictions.includes(item))) {
      return closed("review_required", ["UNKNOWN_RESTRICTION"], version);
    }
    if (recovery?.some((item) => !parsed.policy.knownRecoveryFlags.includes(item))) {
      return closed("review_required", ["UNKNOWN_RECOVERY_FLAG"], version);
    }
    return closed("review_required", ["MANUAL_REVIEW_ONLY"], version);
  }

  const missing = missingInputCodes(input);
  if (missing.length > 0) return closed("review_required", missing, version);

  const skills = stringList(input.verifiedSkills) ?? [];
  const recovery = stringList(input.recoveryFlags) ?? [];
  const restrictions = stringList(input.authorizedRestrictions) ?? [];
  const supervision = supervisionOf(input.supervision);
  if (restrictions.some((item) => !parsed.policy.knownRestrictions.includes(item))) {
    return closed("review_required", ["UNKNOWN_RESTRICTION"], version);
  }
  if (recovery.some((item) => !parsed.policy.knownRecoveryFlags.includes(item))) {
    return closed("review_required", ["UNKNOWN_RECOVERY_FLAG"], version);
  }
  if (restrictions.some((item) => parsed.policy.blockingRestrictions.includes(item))) {
    return closed("block", ["RESTRICTION_BLOCK"], version);
  }
  if (recovery.some((item) => parsed.policy.blockingRecoveryFlags.includes(item))) {
    return closed("block", ["RECOVERY_FLAG_BLOCK"], version);
  }
  const trainingAge = input.trainingAge;
  if (
    condition.minTrainingAgeYears !== undefined &&
    typeof trainingAge === "number" &&
    trainingAge < condition.minTrainingAgeYears
  ) {
    return closed("review_required", ["TRAINING_AGE_INSUFFICIENT"], version);
  }
  if (condition.requiredSkills?.some((skill) => !skills.includes(skill))) {
    return closed("review_required", ["REQUIRED_SKILL_MISSING"], version);
  }
  const recentLoad = input.recentLoad;
  if (
    condition.allowedLoads !== undefined &&
    (typeof recentLoad !== "string" || !(condition.allowedLoads as readonly string[]).includes(recentLoad))
  ) {
    return closed("review_required", ["LOAD_NOT_ALLOWED"], version);
  }
  if (skills.length === 0) return closed("review_required", ["NO_VERIFIED_SKILLS"], version);
  if (supervision === null || !supervision.qualified || !supervision.present) {
    return closed("review_required", ["SUPERVISION_INSUFFICIENT"], version);
  }

  const conditional = (CONDITIONAL_SAFETY_OBJECT_IDS as readonly string[]).includes(input.objectId);
  return closed(conditional ? "allow_with_supervision" : "allow", ["POLICY_SATISFIED"], version);
}
