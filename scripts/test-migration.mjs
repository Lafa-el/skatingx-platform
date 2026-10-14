// Gate placeholder for migration-script tests (AGENTS.md "Testing and CI gates").
//
// Race Day Phase 0 ships no migration script, so there is nothing to test. This is an
// explicit, recorded "not applicable" and not a silent skip. It stops being valid as soon
// as a migration script appears, and then this script must be replaced by real tests.
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(rootDir, "scripts", "migrations");

if (existsSync(migrationsDir) && readdirSync(migrationsDir).length > 0) {
  console.error(
    "[test:migration] FAIL: scripts/migrations/ contains files, so 'not applicable' no longer holds. " +
      "Replace this script with dry-run, idempotency and reconciliation tests.",
  );
  process.exit(1);
}

console.log(
  "[test:migration] N/A: no migration scripts in this repository (Race Day Phase 0 has none).",
);
