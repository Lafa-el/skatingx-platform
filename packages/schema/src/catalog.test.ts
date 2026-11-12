import { describe, expect, it } from "vitest";

import type { CatalogKind, CatalogRef, TrainingTask } from "./index";

const REFS: Record<CatalogKind, CatalogRef> = {
  exercise: { kind: "exercise", id: "EX-SHAPE-001", contentVersion: "1" },
  drill: { kind: "drill", id: "DR-SHAPE-001", contentVersion: "1" },
  block: { kind: "block", id: "BL-SHAPE-001", contentVersion: "1" },
  session: { kind: "session", id: "SESS-SHAPE-001", contentVersion: "1" },
};

describe("CatalogRef", () => {
  it("keeps kind, id, and contentVersion for each kind", () => {
    const kinds: CatalogKind[] = ["exercise", "drill", "block", "session"];
    for (const kind of kinds) {
      const ref: CatalogRef = REFS[kind];
      expect(Object.keys(ref).sort()).toEqual(["contentVersion", "id", "kind"]);
      expect(ref).toEqual({
        kind,
        id: ref.id,
        contentVersion: "1",
      });
    }
    expect(REFS.exercise.id.startsWith("EX-")).toBe(true);
    expect(REFS.drill.id.startsWith("DR-")).toBe(true);
    expect(REFS.block.id.startsWith("BL-")).toBe(true);
    expect(REFS.session.id.startsWith("SESS-")).toBe(true);
  });

  it("allows a task with or without catalogRef", () => {
    const withRef: TrainingTask = {
      id: "task-with-ref",
      text: "linked",
      completed: false,
      createdAt: "2026-11-12T00:00:00.000Z",
      catalogRef: REFS.drill,
    };
    const withoutRef: TrainingTask = {
      id: "task-without-ref",
      text: "plain",
      completed: false,
      createdAt: "2026-11-12T00:00:00.000Z",
    };

    expect(withRef.catalogRef).toEqual(REFS.drill);
    expect(withoutRef.catalogRef).toBeUndefined();
  });
});
