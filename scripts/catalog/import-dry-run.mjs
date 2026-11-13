// Runs the catalog import dry run inside the Firestore emulator.
//
// Fails loudly when a precondition is missing. A green run must mean the
// committed inventory was checked against the emulator, not skipped.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const projectId = "demo-skatingx-import";

const required = [
  "firestore.rules",
  "vitest.catalog.config.ts",
  "docs/skatingx-v2/inventory/workbook-inventory.json",
];

for (const relativePath of required) {
  if (!existsSync(path.join(rootDir, relativePath))) {
    console.error(`[catalog-dry-run] BLOCKED: missing ${relativePath}`);
    process.exit(1);
  }
}

// `demo-` project ids never resolve to a real Firebase project.
if (!projectId.startsWith("demo-")) {
  console.error("[catalog-dry-run] BLOCKED: emulator project id must start with demo-");
  process.exit(1);
}

const result = spawnSync(
  "npx",
  [
    "--no-install",
    "firebase",
    "emulators:exec",
    "--only",
    "firestore",
    "--project",
    projectId,
    "npx --no-install vitest run --config vitest.catalog.config.ts",
  ],
  { cwd: rootDir, stdio: "inherit" },
);

process.exit(result.status ?? 1);
