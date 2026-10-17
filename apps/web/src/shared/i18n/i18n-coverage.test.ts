import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { findHardcodedText } from "@/test/hardcoded-text";

/**
 * ADR-004: every file in the web app takes its text from the i18n resources, so a file with
 * hardcoded text fails here. Every slice is migrated; there is no list of exceptions any more, and
 * new code cannot add text outside the resources.
 */
const SRC = fileURLToPath(new URL("../..", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      // Resource files hold the text on purpose; test helpers and fixtures are not shipped.
      return name === "i18n" || name === "test" ? [] : sourceFiles(full);
    }
    const isSource = /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts");
    return isSource ? [full] : [];
  });
}

const findingsByFile = new Map<string, ReturnType<typeof findHardcodedText>>();
for (const file of sourceFiles(SRC)) {
  findingsByFile.set(path.relative(SRC, file).split(path.sep).join("/"), findHardcodedText(file, readFileSync(file, "utf8")));
}

describe("i18n coverage (ADR-004)", () => {
  it("scans the app, so an empty result cannot pass by accident", () => {
    expect(findingsByFile.size).toBeGreaterThan(50);
    expect(findingsByFile.has("modules/race-day/pages/TodayPage.tsx")).toBe(true);
  });

  it("no file has hardcoded text", () => {
    const offenders = [...findingsByFile]
      .filter(([, findings]) => findings.length > 0)
      .map(([file, findings]) => `${file}:${String(findings[0]?.line)} ${findings[0]?.kind} "${findings[0]?.text}" (+${String(findings.length - 1)} more)`);
    expect(offenders).toEqual([]);
  });
});
