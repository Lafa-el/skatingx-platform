import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { contrastRatio, hueDistance } from "@/test/contrast";

// The tokens are read from the stylesheet itself, so the numbers in docs/design/ui-redesign-v1.md
// (appendix B.1) cannot drift from the values that ship.
const css = readFileSync(fileURLToPath(new URL("./index.css", import.meta.url)), "utf8");

function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
  if (!match) throw new Error(`Token --color-${name} is not defined in index.css`);
  return match[1];
}

const navy = token("brand-navy");
const flame = token("brand-flame");
const flameHover = token("brand-flame-hover");
const energy = token("brand-energy");
const ice = token("brand-ice");
const track = token("brand-track");
const danger = token("status-danger");
const dangerTint = token("status-danger-tint");
const pendingTint = token("status-pending-tint");
const success = token("status-success");
const successTint = token("status-success-tint");

const TEXT = 4.5;
const GRAPHIC = 3;

describe("UI v1 colour tokens: brand colours", () => {
  it.each([
    ["navy on flame (buttons, hero card, selected nav)", navy, flame],
    ["navy on flame hover", navy, flameHover],
    ["navy on energy (the far end of the hero gradient)", navy, energy],
    ["navy on ice (page text)", navy, ice],
    ["navy on white", navy, "#ffffff"],
  ])("small text passes: %s", (_name, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(TEXT);
  });

  it("keeps white off flame and energy, where it would not pass for small text", () => {
    // If a token change ever makes white readable here, this guard and the doc can be relaxed together.
    expect(contrastRatio("#ffffff", flame)).toBeLessThan(TEXT);
    expect(contrastRatio("#ffffff", energy)).toBeLessThan(GRAPHIC);
  });

  it("draws the progress fill so its edge can be seen against the track", () => {
    expect(contrastRatio(flame, track)).toBeGreaterThanOrEqual(GRAPHIC);
  });

  it("keeps flame legible as an icon or indicator on the dark sidebar", () => {
    expect(contrastRatio(flame, navy)).toBeGreaterThanOrEqual(GRAPHIC);
  });
});

describe("UI v1 colour tokens: status colours", () => {
  it("error text is readable on its tint and on white", () => {
    expect(contrastRatio(danger, dangerTint)).toBeGreaterThanOrEqual(TEXT);
    expect(contrastRatio(danger, "#ffffff")).toBeGreaterThanOrEqual(TEXT);
  });

  it("error is a different hue from the brand flame (the first suggested red was not)", () => {
    // #D92D20 is 4.2 degrees from flame's 5.1, which is the same red. Anything under 10 is too close.
    expect(hueDistance(danger, flame)).toBeGreaterThanOrEqual(10);
  });

  it("tag text and glyphs are readable on their tints", () => {
    expect(contrastRatio(navy, pendingTint)).toBeGreaterThanOrEqual(TEXT);
    expect(contrastRatio(navy, successTint)).toBeGreaterThanOrEqual(TEXT);
    expect(contrastRatio(success, successTint)).toBeGreaterThanOrEqual(GRAPHIC);
  });
});

describe("UI v1 stylesheet", () => {
  it("defines the card and control radii and the timing-board number style", () => {
    expect(css).toMatch(/--radius-card:\s*1rem/);
    expect(css).toMatch(/--radius-control:\s*0\.75rem/);
    expect(css).toMatch(/@utility sx-numeric\s*\{[^}]*font-style:\s*italic/);
  });

  it("does not load fonts from anywhere (no runtime CDN)", () => {
    expect(css).not.toMatch(/@font-face|url\(|googleapis|jsdelivr/i);
  });

  it("tells Tailwind to read the shared components outside apps/web", () => {
    expect(css).toMatch(/@source "\.\.\/\.\.\/\.\.\/\.\.\/packages\/ui\/src"/);
  });
});
