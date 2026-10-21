// Runs the migration checks inside the Firestore emulator.
// A demo- project id cannot resolve to skatingx-prod or any other real project.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const result = spawnSync(
  "npx",
  [
    "--no-install",
    "firebase",
    "emulators:exec",
    "--only",
    "firestore",
    "--project",
    "demo-skatingx-migration",
    "node scripts/migrate-analysis.test.mjs && node scripts/migrate-current-data.test.mjs && node scripts/migrate-auth-users.test.mjs && node scripts/verify-prod-migration.test.mjs && node scripts/migration/training-source-counts.test.mjs",
  ],
  { cwd: rootDir, stdio: "inherit" },
);

process.exit(result.status ?? 1);
