import { describe, expect, it } from "vitest";

import { PLATFORM_APP_ID } from "./constants";
import { paths } from "./paths";

describe("equipment history path", () => {
  it("is the 10-segment record from ADR-005, not the unused 9-segment helper", () => {
    const record = paths.equipmentHistoryRecord("alice", "lindsay", "equip-1");
    expect(record.split("/")).toEqual([
      "artifacts",
      PLATFORM_APP_ID,
      "users",
      "alice",
      "athletes",
      "lindsay",
      "equipment",
      "main",
      "records",
      "equip-1",
    ]);
    expect(record.split("/")).toHaveLength(10);
    expect(paths.equipmentHistoryCollection("alice", "lindsay").split("/")).toHaveLength(9);
    expect(paths.equipmentRecord("alice", "lindsay", "equip-1")).not.toBe(record);
  });
});
