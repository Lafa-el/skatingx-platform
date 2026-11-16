import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const rootDir = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const script = path.join(rootDir, "scripts/catalog/stdin-confirm-chain.mjs");

function confirm(mode: string, input: string) {
  return spawnSync(process.execPath, [script, mode], {
    cwd: rootDir,
    encoding: "utf8",
    input,
    env: process.env,
  });
}

describe("real stdin confirmation chain", () => {
  for (const mode of ["initial", "resume", "rollback", "recover"] as const) {
    it(`accepts the project id for ${mode} and rejects empty, wrong, and mismatched case`, () => {
      const accepted = confirm(mode, "skatingx-prod\n");
      expect(accepted.status, `${accepted.stderr}\n${accepted.stdout}`).toBe(0);
      expect(accepted.stdout).toContain("confirmation-accepted");
      expect(accepted.stderr).toContain(`post-confirm checkpoint ${mode}`);
      expect(accepted.stderr).not.toMatch(/confirmation was rejected/);

      for (const input of ["\n", "wrong-project\n", "SkatingX-Prod\n"]) {
        const rejected = confirm(mode, input);
        expect(rejected.status, rejected.stdout).toBe(2);
        expect(rejected.stderr).toMatch(/confirmation was rejected/);
        expect(rejected.stdout).not.toContain("confirmation-accepted");
      }
    });
  }
});
