import { readFileSync } from "node:fs";
import path from "node:path";

import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

/**
 * `RULES_FILE` lets the same tests run against a candidate ruleset before it replaces
 * `firestore.rules`. It defaults to the committed rules.
 */
export function readRules(): string {
  const file = process.env.RULES_FILE ?? path.resolve("firestore.rules");
  return readFileSync(file, "utf8");
}

// A `demo-` project id can never resolve to a real Firebase project.
export async function createRulesEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: "demo-skatingx-rules",
    firestore: { rules: readRules() },
  });
}

export const USERS = "artifacts/skatingx-production/users";
