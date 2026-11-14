export const LIVE_RULES_PROJECT: string;
export const RULES_BASELINE_COMMIT: string;
export const APPROVED_BASELINE_SHA256: string;
export const APPROVED_CANDIDATE_SHA256: string;

export function sha256Text(value: string): string;

export function approveHashes(baselineSha256: string, candidateSha256: string): { passed: boolean; errors: string[] };

export function assertApprovedRepoRules(rootDir: string): {
  passed: boolean;
  errors: string[];
  baselineSha256: string;
  candidateSha256: string;
  baseline: string;
  candidate: string;
};

export function compareRulesRelease(input: {
  mode: "predeploy" | "postdeploy";
  liveContent: string;
  baselineContent: string;
  candidateContent: string;
}): {
  passed: boolean;
  errors: string[];
  liveMatchesCandidate: boolean;
  liveSha256: string;
};

export function fetchRulesRelease(
  fetchImpl: (url: string, init: { method?: string; headers?: Record<string, string> }) => Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
  }>,
  input: { projectId: string; token: string },
): Promise<{ content: string; databaseId: string; sourceSha256: string; rulesetName: string }>;

export function readLiveRules(
  fetchImpl: (url: string, init: { method?: string; headers?: Record<string, string> }) => Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
  }>,
  input: { projectId: string; token: string },
): Promise<{ content: string }>;
