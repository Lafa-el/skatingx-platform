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
  readLiveRules,
} from "../../scripts/catalog/verify-live-rules.mjs";

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
});
