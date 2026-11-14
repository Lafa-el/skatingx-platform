// Read-only check of the live Firestore ruleset for skatingx-prod.
// This module never calls create, patch, delete, or deploy.
// The #181 baseline is the committed text file, so a shallow CI checkout can
// verify it without fetching older history.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LIVE_RULES_PROJECT = "skatingx-prod";
export const RULES_BASELINE_COMMIT = "96abc3307d5bfe9a826dc1be343e9cc228ba1a32";
export const APPROVED_BASELINE_SHA256 = "68b6a84684fe1753c454b000dacc18933e25f50b7a065d03597d1453ecc149e8";
export const APPROVED_CANDIDATE_SHA256 = "774962f3d60251a2c11ec547ec9631a6bf28a9964f07e6aa4580953c726b3457";

const RELEASE_NAMES = [
  `projects/${LIVE_RULES_PROJECT}/releases/cloud.firestore`,
  `projects/${LIVE_RULES_PROJECT}/releases/cloud.firestore/(default)`,
];

export function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function readRepoRules(rootDir) {
  const baseline = readFileSync(path.join(rootDir, "docs/skatingx-v2/import/rules-baseline-181.txt"), "utf8");
  const candidate = readFileSync(path.join(rootDir, "firestore.rules"), "utf8");
  return { baseline, candidate };
}

export function approveHashes(baselineSha256, candidateSha256) {
  const errors = [];
  if (baselineSha256 !== APPROVED_BASELINE_SHA256) errors.push("git baseline does not match the approved #181 rules");
  if (candidateSha256 !== APPROVED_CANDIDATE_SHA256) errors.push("candidate firestore.rules has an unapproved diff");
  return { passed: errors.length === 0, errors };
}

export function assertApprovedRepoRules(rootDir) {
  const { baseline, candidate } = readRepoRules(rootDir);
  const baselineSha256 = sha256Text(baseline);
  const candidateSha256 = sha256Text(candidate);
  const approved = approveHashes(baselineSha256, candidateSha256);
  return { ...approved, baselineSha256, candidateSha256, baseline, candidate };
}

export function compareRulesRelease({ mode, liveContent, baselineContent, candidateContent }) {
  if (typeof liveContent !== "string" || typeof baselineContent !== "string" || typeof candidateContent !== "string") {
    throw new Error("rules source is incomplete");
  }
  const liveSha256 = sha256Text(liveContent);
  const baselineSha256 = sha256Text(baselineContent);
  const candidateSha256 = sha256Text(candidateContent);
  const errors = [];
  if (mode === "predeploy") {
    if (liveSha256 !== baselineSha256) errors.push("live rules drifted from the #181 baseline");
  } else if (mode === "postdeploy") {
    if (liveSha256 !== candidateSha256) errors.push("live rules do not match the approved candidate");
  } else {
    errors.push("mode must be predeploy or postdeploy");
  }
  return {
    passed: errors.length === 0,
    errors,
    mode,
    liveSha256,
    baselineSha256,
    candidateSha256,
    liveMatchesCandidate: liveSha256 === candidateSha256,
  };
}

function releaseNameOk(name) {
  return RELEASE_NAMES.includes(name);
}

export function sourceFromRuleset(ruleset, projectId) {
  const name = typeof ruleset?.name === "string" ? ruleset.name : "";
  if (!name.startsWith(`projects/${projectId}/rulesets/`)) {
    throw new Error("ruleset read failed: project identity does not match");
  }
  const files = ruleset.source?.files;
  if (!Array.isArray(files) || files.length === 0) throw new Error("rules source is incomplete");
  if (files.length !== 1) {
    const names = files.map((file) => (typeof file?.name === "string" ? file.name : "unnamed")).join(", ");
    throw new Error(`unsupported multi-file ruleset: ${names}`);
  }
  const file = files[0];
  if (typeof file?.content !== "string" || file.content.length === 0) throw new Error("rules source is incomplete");
  return { rulesetName: name, fileName: typeof file.name === "string" ? file.name : "firestore.rules", content: file.content };
}

export async function fetchRulesRelease(fetchImpl, { projectId, token }) {
  if (projectId !== LIVE_RULES_PROJECT) throw new Error(`refusing rules read for project ${projectId}`);
  if (typeof token !== "string" || token.trim() === "") throw new Error("refusing live rules read: no token");
  const headers = { Authorization: `Bearer ${token}` };
  const releaseUrl = `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore`;
  const releaseResponse = await fetchImpl(releaseUrl, { method: "GET", headers });
  if (!releaseResponse.ok) throw new Error(`rules read failed: ${releaseResponse.status}`);
  const release = await releaseResponse.json();
  if (!releaseNameOk(release?.name)) {
    throw new Error(`release points at the wrong database: ${String(release?.name ?? "")}`);
  }
  const rulesetName = typeof release?.rulesetName === "string" ? release.rulesetName : "";
  if (!rulesetName.startsWith(`projects/${projectId}/rulesets/`)) {
    throw new Error("ruleset read failed: ruleset identity does not match");
  }
  const rulesetResponse = await fetchImpl(`https://firebaserules.googleapis.com/v1/${rulesetName}`, { method: "GET", headers });
  if (!rulesetResponse.ok) throw new Error(`rules read failed: ${rulesetResponse.status}`);
  const ruleset = await rulesetResponse.json();
  const source = sourceFromRuleset(ruleset, projectId);
  return {
    projectId,
    service: "cloud.firestore",
    databaseId: "(default)",
    releaseName: release.name,
    rulesetName: source.rulesetName,
    fileName: source.fileName,
    content: source.content,
    sourceSha256: sha256Text(source.content),
    queriedAt: new Date().toISOString(),
  };
}

export async function readLiveRules(fetchImpl, options) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("refusing live rules read while FIRESTORE_EMULATOR_HOST is set");
  }
  if (process.env.SKATINGX_RULES_READ !== "allow") {
    throw new Error("refusing live rules read without SKATINGX_RULES_READ=allow");
  }
  return fetchRulesRelease(fetchImpl, options);
}

async function main() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const mode = process.argv.includes("--postdeploy") ? "postdeploy" : "predeploy";
  const approved = assertApprovedRepoRules(rootDir);
  if (!approved.passed) {
    console.log(JSON.stringify({ passed: false, errors: approved.errors, mode }));
    process.exitCode = 1;
    return;
  }
  const live = await readLiveRules(globalThis.fetch, {
    projectId: LIVE_RULES_PROJECT,
    token: process.env.FIREBASE_RULES_TOKEN ?? "",
  });
  const compared = compareRulesRelease({
    mode,
    liveContent: live.content,
    baselineContent: approved.baseline,
    candidateContent: approved.candidate,
  });
  console.log(JSON.stringify({
    passed: compared.passed,
    errors: compared.errors,
    mode,
    projectId: live.projectId,
    databaseId: live.databaseId,
    releaseName: live.releaseName,
    rulesetName: live.rulesetName,
    sourceSha256: live.sourceSha256,
    queriedAt: live.queriedAt,
  }));
  if (!compared.passed) process.exitCode = 1;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
