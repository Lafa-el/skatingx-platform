import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const vercelPath = join(dirname(fileURLToPath(import.meta.url)), "../vercel.json");

describe("pose asset hosting", () => {
  it("caches versioned pose files for a year and does not rewrite them to the app shell", () => {
    const config = JSON.parse(readFileSync(vercelPath, "utf8")) as {
      headers: { source: string; headers: { key: string; value: string }[] }[];
      rewrites: { source: string; destination: string }[];
    };
    expect(config.headers).toEqual([
      {
        source: "/mediapipe/pose/(.*)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ]);
    expect(config.rewrites).toEqual([
      { source: "/((?!assets/|mediapipe/).*)", destination: "/index.html" },
    ]);
    const rewrite = new RegExp(`^${config.rewrites[0]?.source ?? ""}$`);
    expect(rewrite.test("/mediapipe/pose/0.5.1675469404/missing.wasm")).toBe(false);
    expect(rewrite.test("/assets/index.js")).toBe(false);
    expect(rewrite.test("/analysis/biomechanics")).toBe(true);
  });
});
