import { describe, expect, it } from "vitest";

import { canonicalCatalogJson } from "./canonical-json";

describe("canonicalCatalogJson", () => {
  it("keeps __proto__ and constructor instead of dropping them", () => {
    const parsed: unknown = JSON.parse('{"__proto__":{"flag":1},"name":"Jump"}');
    const plain = { name: "Jump" };
    const parsedJson = canonicalCatalogJson(parsed);
    expect(parsedJson).not.toBe(canonicalCatalogJson(plain));
    expect(parsedJson).toContain('"__proto__"');
    expect(canonicalCatalogJson(JSON.parse('{"constructor":1,"name":"Jump"}'))).toBe(
      '{"constructor":1,"name":"Jump"}',
    );
  });

  it("sorts integer-looking keys by UTF-16 code units", () => {
    expect(canonicalCatalogJson({ "2": "b", "10": "a" })).toBe('{"10":"a","2":"b"}');
  });

  it("is stable across calls and key order", () => {
    const first = { b: 1, a: { d: true, c: [null, "x"] } };
    const shuffled = { a: { c: [null, "x"], d: true }, b: 1 };
    expect(canonicalCatalogJson(first)).toBe(canonicalCatalogJson(shuffled));
    expect(canonicalCatalogJson(first)).toBe(canonicalCatalogJson(first));
  });

  it("rejects values that are not plain JSON data", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    const rejected: unknown[] = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      undefined,
      () => 1,
      Symbol("x"),
      1n,
      circular,
      new Date(0),
    ];
    for (const value of rejected) {
      expect(() => canonicalCatalogJson(value)).toThrow(/canonical JSON rejects/);
    }
  });
});
