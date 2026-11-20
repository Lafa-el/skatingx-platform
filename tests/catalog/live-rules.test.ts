import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  APPROVED_BASELINE_SHA256,
  APPROVED_CANDIDATE_SHA256,
  approveHashes,
  assertApprovedRepoRules,
  compareRulesRelease,
  fetchRulesRelease,
  normalizeRulesContent,
  readLiveRules,
  sha256Text,
} from "../../scripts/catalog/verify-live-rules.mjs";

const NORMALIZED_BASELINE_SHA256 = "3851e82d571651914f6c26560b66077f168c15b3e56d6dfc579356c1fa83db15";

const rootDir = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const source = readFileSync(path.join(rootDir, "scripts/catalog/verify-live-rules.mjs"), "utf8");

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function release(name = "projects/skatingx-prod/releases/cloud.firestore") {
  return { name, rulesetName: "projects/skatingx-prod/rulesets/rs-1" };
}

function ruleset(content: string, files = [{ name: "firestore.rules", content }]) {
  return { name: "projects/skatingx-prod/rulesets/rs-1", source: { files } };
}

describe("live ruleset check", () => {
  it("accepts the current live rules when they match the #181 baseline", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchImpl = async (url: string, init: { method?: string }) => {
      calls.push({ url, method: init.method ?? "GET" });
      if (url.endsWith("/releases/cloud.firestore")) return response(release());
      return response(ruleset("rules-v181"));
    };
    const live = await fetchRulesRelease(fetchImpl, { projectId: "skatingx-prod", token: "token" });
    const compared = compareRulesRelease({
      mode: "predeploy",
      liveContent: live.content,
      baselineContent: "rules-v181",
      candidateContent: "rules-v181\ncatalog",
    });
    expect(compared.passed).toBe(true);
    expect(compared.liveMatchesCandidate).toBe(false);
    expect(live.databaseId).toBe("(default)");
    expect(calls.every((call) => call.method === "GET")).toBe(true);
  });

  it("rejects live drift, an unapproved candidate, and a release for another database", async () => {
    const drifted = compareRulesRelease({
      mode: "predeploy",
      liveContent: "rules-v181\nextra",
      baselineContent: "rules-v181",
      candidateContent: "rules-v181\ncatalog",
    });
    expect(drifted.passed).toBe(false);
    expect(drifted.errors.join(" ")).toMatch(/drifted/);

    const unapproved = approveHashes(APPROVED_BASELINE_SHA256, "0".repeat(64));
    expect(unapproved.passed).toBe(false);
    expect(unapproved.errors.join(" ")).toMatch(/unapproved/);

    const fetchImpl = async (url: string) => {
      if (url.endsWith("/releases/cloud.firestore")) {
        return response(release("projects/skatingx-prod/releases/cloud.firestore/other"));
      }
      return response(ruleset("rules-v181"));
    };
    await expect(fetchRulesRelease(fetchImpl, { projectId: "skatingx-prod", token: "token" })).rejects.toThrow(/wrong database/);
  });

  it("rejects a failed or incomplete ruleset and a multi-file bundle", async () => {
    const failed = async () => response({}, 500);
    await expect(fetchRulesRelease(failed, { projectId: "skatingx-prod", token: "token" })).rejects.toThrow(/rules read failed/);

    const incomplete = async (url: string) => {
      if (url.endsWith("/releases/cloud.firestore")) return response(release());
      return response({ name: "projects/skatingx-prod/rulesets/rs-1", source: { files: [] } });
    };
    await expect(fetchRulesRelease(incomplete, { projectId: "skatingx-prod", token: "token" })).rejects.toThrow(/incomplete/);

    const multi = async (url: string) => {
      if (url.endsWith("/releases/cloud.firestore")) return response(release());
      return response(ruleset("", [
        { name: "firestore.rules", content: "a" },
        { name: "extra.rules", content: "b" },
      ]));
    };
    await expect(fetchRulesRelease(multi, { projectId: "skatingx-prod", token: "token" })).rejects.toThrow(/unsupported multi-file ruleset: firestore.rules, extra.rules/);
  });

  it("refuses a live read from the emulator and never issues a write request", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return response(release());
    };
    await expect(readLiveRules(fetchImpl, { projectId: "skatingx-prod", token: "token" })).rejects.toThrow(/FIRESTORE_EMULATOR_HOST/);
    expect(calls).toBe(0);
    expect(source).not.toMatch(/method:\s*["'](?!GET)/);
    expect(source).not.toMatch(/\b(POST|PATCH|DELETE)\b/);
  });

  it("keeps the approved repository baseline and candidate hashes", () => {
    const approved = assertApprovedRepoRules(rootDir);
    expect(approved.passed, approved.errors.join("; ")).toBe(true);
    expect(approved.baselineSha256).toBe(APPROVED_BASELINE_SHA256);
    expect(approved.candidateSha256).toBe(APPROVED_CANDIDATE_SHA256);
    const later = compareRulesRelease({
      mode: "postdeploy",
      liveContent: approved.candidate,
      baselineContent: approved.baseline,
      candidateContent: approved.candidate,
    });
    expect(later.passed).toBe(true);
  });

  it("treats a trailing line feed as the same rules source", () => {
    const approved = assertApprovedRepoRules(rootDir);
    expect(approved.baselineSha256).toBe(APPROVED_BASELINE_SHA256);
    expect(approved.baselineSha256).toBe("68b6a84684fe1753c454b000dacc18933e25f50b7a065d03597d1453ecc149e8");
    expect(sha256Text(normalizeRulesContent(approved.baseline))).toBe(NORMALIZED_BASELINE_SHA256);
    expect(APPROVED_CANDIDATE_SHA256).toBe("fd795a9ae52de8189211187226613dd8be04bcc8ff6267d671650576e1c01581");
    expect(approved.candidateSha256).toBe(APPROVED_CANDIDATE_SHA256);

    const strippedBaseline = compareRulesRelease({
      mode: "predeploy",
      liveContent: normalizeRulesContent(approved.baseline),
      baselineContent: approved.baseline,
      candidateContent: approved.candidate,
    });
    expect(strippedBaseline.passed).toBe(true);
    expect(strippedBaseline.liveSha256).toBe(NORMALIZED_BASELINE_SHA256);

    const extraStatement = compareRulesRelease({
      mode: "predeploy",
      liveContent: `${approved.baseline}\nmatch /liveDriftProbe/{id} {\n  allow read: if false;\n}`,
      baselineContent: approved.baseline,
      candidateContent: approved.candidate,
    });
    expect(extraStatement.passed).toBe(false);
    expect(extraStatement.errors.join(" ")).toMatch(/drifted/);

    const marker = "service cloud.firestore";
    const markerAt = approved.baseline.indexOf(marker);
    expect(markerAt).toBeGreaterThan(0);
    const interior = compareRulesRelease({
      mode: "predeploy",
      liveContent: `${approved.baseline.slice(0, markerAt)}service  cloud.firestore${approved.baseline.slice(markerAt + marker.length)}`,
      baselineContent: approved.baseline,
      candidateContent: approved.candidate,
    });
    expect(interior.passed).toBe(false);

    const strippedCandidate = compareRulesRelease({
      mode: "postdeploy",
      liveContent: normalizeRulesContent(approved.candidate),
      baselineContent: approved.baseline,
      candidateContent: approved.candidate,
    });
    expect(strippedCandidate.passed).toBe(true);
    expect(strippedCandidate.liveMatchesCandidate).toBe(true);

    const extraCandidate = compareRulesRelease({
      mode: "postdeploy",
      liveContent: `${approved.candidate}\nmatch /liveDriftProbe/{id} {\n  allow read: if false;\n}`,
      baselineContent: approved.baseline,
      candidateContent: approved.candidate,
    });
    expect(extraCandidate.passed).toBe(false);
    const missingCandidate = compareRulesRelease({
      mode: "postdeploy",
      liveContent: approved.baseline,
      baselineContent: approved.baseline,
      candidateContent: approved.candidate,
    });
    expect(missingCandidate.passed).toBe(false);
  });

  it("hashes fetched rules from the normalized source and keeps requests on GET", async () => {
    const approved = assertApprovedRepoRules(rootDir);
    const calls: Array<{ url: string; method: string }> = [];
    const fetchImpl = async (url: string, init: { method?: string }) => {
      calls.push({ url, method: init.method ?? "GET" });
      if (url.endsWith("/releases/cloud.firestore")) return response(release());
      return response(ruleset(approved.baseline));
    };
    const live = await fetchRulesRelease(fetchImpl, { projectId: "skatingx-prod", token: "token" });
    expect(live.sourceSha256).toBe(sha256Text(normalizeRulesContent(approved.baseline)));
    expect(live.sourceSha256).toBe(NORMALIZED_BASELINE_SHA256);
    expect(live.rawSourceSha256).toBe(APPROVED_BASELINE_SHA256);
    expect(calls.every((call) => call.method === "GET")).toBe(true);
  });
});
