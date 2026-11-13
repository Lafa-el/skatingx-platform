import { describe, expect, it } from "vitest";

import { computeCatalogChecksum } from "./checksum";

describe("computeCatalogChecksum", () => {
  it("is stable for the same payload and for shuffled keys", () => {
    const first = {
      b: 1,
      a: { d: 2, c: [3, 1] },
    };
    const shuffled = {
      a: { c: [3, 1], d: 2 },
      b: 1,
    };
    const once = computeCatalogChecksum(first);
    const twice = computeCatalogChecksum(first);
    expect(once).toBe(twice);
    expect(computeCatalogChecksum(shuffled)).toBe(once);
    expect(once).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when one field changes", () => {
    const before = computeCatalogChecksum({ name: "Drop Jump", n: 1 });
    const after = computeCatalogChecksum({ name: "Drop Jump", n: 2 });
    expect(after).not.toBe(before);
  });
});
