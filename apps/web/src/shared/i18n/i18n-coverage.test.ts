import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { findHardcodedText } from "@/test/hardcoded-text";

/**
 * ADR-004: every file in the web app takes its text from the i18n resources. Files that have not
 * been migrated yet are listed here with the slice that migrates them. The list only shrinks:
 *
 * - a file that is not listed must have no hardcoded text, so new code cannot add any;
 * - a listed file that no longer has any must be removed from the list (second test), so the
 *   list always matches reality and an unfinished slice cannot hide behind it.
 *
 * When the last slice is done this list is empty and the test becomes the plain rule.
 */
const NOT_MIGRATED: Record<string, "S6e"> = {
  // S6e: analysis
  "pages/analysis/AnalysisBiomechanicsPage.tsx": "S6e",
  "pages/analysis/AnalysisEquipmentPage.tsx": "S6e",
  "pages/analysis/AnalysisHubPage.tsx": "S6e",
  "pages/analysis/AnalysisPacingPage.tsx": "S6e",
};

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

  it("no file outside the not-migrated list has hardcoded text", () => {
    const offenders = [...findingsByFile]
      .filter(([file, findings]) => findings.length > 0 && !(file in NOT_MIGRATED))
      .map(([file, findings]) => `${file}:${String(findings[0]?.line)} ${findings[0]?.kind} "${findings[0]?.text}" (+${String(findings.length - 1)} more)`);
    expect(offenders).toEqual([]);
  });

  it("every file on the not-migrated list exists and still has hardcoded text", () => {
    const stale = Object.keys(NOT_MIGRATED).filter((file) => (findingsByFile.get(file)?.length ?? 0) === 0);
    expect(stale, "migrated or missing: remove from NOT_MIGRATED").toEqual([]);
  });
});
