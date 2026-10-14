// Runs Security Rules tests inside the Firestore emulator.
//
// Fails loudly (exit 1) instead of passing when preconditions are missing. A green
// `test:rules` must mean rules were actually tested (AGENTS.md: no bypassing gates).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rulesFile = path.join(rootDir, "firestore.rules");

if (!existsSync(rulesFile)) {
  console.error(
    [
      "[test:rules] BLOCKED: firestore.rules is not in the repository yet.",
      "Rules are added only after the current console rules are recorded",
      "(ADR-001 D8, gate G1 in docs/runbooks/race-day-phase0-s0-checklist.md).",
      "Without the file the emulator would run with open rules and tests would be meaningless.",
    ].join("\n"),
  );
  process.exit(1);
}

// `demo-` project ids never resolve to a real Firebase project, so this cannot touch
// staging or production data even if credentials are present on the machine.
const result = spawnSync(
  "npx",
  [
    "--no-install",
    "firebase",
    "emulators:exec",
    "--only",
    "firestore",
    "--project",
    "demo-skatingx-rules",
    "npx --no-install vitest run --config vitest.rules.config.ts",
  ],
  { cwd: rootDir, stdio: "inherit" },
);

process.exit(result.status ?? 1);
