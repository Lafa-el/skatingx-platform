import { describe, expect, it } from "vitest";

import type { PoseLandmark } from "./pose-engine";
import {
  POSE_CONNECTIONS,
  POSE_CONNECTOR_STYLE,
  POSE_LANDMARK_STYLE,
  SUPPORT_LEG_STYLE,
  drawPoseOverlay,
  supportOverlaySide,
} from "./pose-overlay";

interface Stroke {
  readonly strokeStyle: string;
  readonly lineWidth: number;
  readonly shadowBlur: number;
}

interface Dot {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly fillStyle: string;
  readonly strokeStyle: string;
  readonly lineWidth: number;
}

function recordingContext(): {
  readonly context: CanvasRenderingContext2D;
  readonly strokes: Stroke[];
  readonly dots: Dot[];
} {
  const strokes: Stroke[] = [];
  const dots: Dot[] = [];
  const state = {
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
    shadowBlur: 0,
  };
  let arc: { x: number; y: number; radius: number } | null = null;
  const context = {
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
    lineCap: "butt",
    lineJoin: "miter",
    shadowColor: "",
    shadowBlur: 0,
    clearRect(): void {},
    save(): void {},
    restore(): void {},
    beginPath(): void {
      arc = null;
    },
    moveTo(): void {},
    lineTo(): void {},
    translate(): void {},
    rotate(): void {},
    arc(x: number, y: number, radius: number): void {
      arc = { x, y, radius };
    },
    stroke(): void {
      state.strokeStyle = context.strokeStyle;
      state.lineWidth = context.lineWidth;
      state.shadowBlur = context.shadowBlur;
      if (arc) {
        dots.push({
          x: arc.x,
          y: arc.y,
          radius: arc.radius,
          fillStyle: context.fillStyle,
          strokeStyle: context.strokeStyle,
          lineWidth: context.lineWidth,
        });
        return;
      }
      strokes.push({
        strokeStyle: context.strokeStyle,
        lineWidth: context.lineWidth,
        shadowBlur: context.shadowBlur,
      });
    },
    fill(): void {},
  };
  return { context: context as unknown as CanvasRenderingContext2D, strokes, dots };
}

function point(index: number, x: number, y: number, visibility = 0.9): PoseLandmark {
  return { x, y, visibility, z: index };
}

describe("pose overlay colors", () => {
  it("locks the old-site connector, landmark, and support-leg colors", () => {
    expect(POSE_CONNECTIONS).toHaveLength(35);
    expect(POSE_CONNECTIONS[0]).toEqual([0, 1]);
    expect(POSE_CONNECTIONS[34]).toEqual([28, 32]);
    expect(POSE_CONNECTOR_STYLE).toEqual({
      color: "rgba(255,255,255,0.35)",
      lineWidth: 2.5,
      visibilityMin: 0.5,
    });
    expect(POSE_LANDMARK_STYLE).toEqual({
      color: "#8b5cf6",
      lineWidth: 1,
      radius: 3,
      visibilityMin: 0.5,
    });
    expect(SUPPORT_LEG_STYLE).toEqual({
      color: "#22c55e",
      lineWidth: 7,
      shadowColor: "rgba(34, 197, 94, 0.55)",
      shadowBlur: 10,
      jointRadius: 6,
      jointStroke: "#ffffff",
      jointLineWidth: 2,
    });
  });

  it("paints white connectors, purple dots, and the green support leg", () => {
    const landmarks: PoseLandmark[] = [];
    landmarks[11] = point(11, 0.4, 0.2);
    landmarks[12] = point(12, 0.6, 0.2);
    landmarks[23] = point(23, 0.42, 0.5);
    landmarks[24] = point(24, 0.58, 0.5);
    landmarks[25] = point(25, 0.4, 0.7);
    landmarks[26] = point(26, 0.62, 0.72);
    landmarks[27] = point(27, 0.38, 0.9);
    landmarks[28] = point(28, 0.66, 0.92, 0.5);
    landmarks[0] = { x: 0.5, y: 0.1 };
    const hidden = point(1, 0.5, 0.12, 0.5);
    landmarks[1] = hidden;
    const { context, strokes, dots } = recordingContext();
    drawPoseOverlay(context, 100, 200, {
      roll: 0,
      grid: false,
      landmarks,
      supportSide: "left",
    });

    const connectors = strokes.filter((stroke) => stroke.strokeStyle === POSE_CONNECTOR_STYLE.color);
    expect(connectors.length).toBeGreaterThan(0);
    expect(connectors.every((stroke) => stroke.lineWidth === 2.5)).toBe(true);
    expect(strokes.some((stroke) => stroke.strokeStyle === "rgba(15, 61, 92, 0.9)")).toBe(false);
    expect(strokes.some((stroke) => stroke.strokeStyle === SUPPORT_LEG_STYLE.color && stroke.lineWidth === 7 && stroke.shadowBlur === 10)).toBe(true);

    const purple = dots.filter((dot) => dot.radius === 3);
    expect(purple.length).toBeGreaterThan(0);
    expect(purple.every((dot) => dot.fillStyle === "#8b5cf6" && dot.strokeStyle === "#8b5cf6" && dot.lineWidth === 1)).toBe(true);
    expect(purple.some((dot) => dot.x === 50 && dot.y === 20)).toBe(true);
    expect(purple.some((dot) => dot.y === hidden.y * 200)).toBe(false);
    expect(purple.some((dot) => dot.x === 66 && dot.y === 184)).toBe(false);

    const joints = dots.filter((dot) => dot.radius === 6);
    expect(joints.map((dot) => [dot.x, dot.y, dot.fillStyle, dot.strokeStyle, dot.lineWidth])).toEqual([
      [42, 100, "#22c55e", "#ffffff", 2],
      [40, 140, "#22c55e", "#ffffff", 2],
      [38, 180, "#22c55e", "#ffffff", 2],
    ]);
  });

  it("does not paint the support leg when the reading is not usable", () => {
    expect(supportOverlaySide({ readable: true, supportSide: "right" })).toBe("right");
    expect(supportOverlaySide({ readable: false, supportSide: "left" })).toBeNull();
    expect(supportOverlaySide({ readable: true, supportSide: "unknown" })).toBeNull();
    const { context, strokes, dots } = recordingContext();
    drawPoseOverlay(context, 100, 100, {
      roll: 0,
      grid: false,
      landmarks: [point(23, 0.2, 0.2), point(25, 0.2, 0.5), point(27, 0.2, 0.8)],
      supportSide: null,
    });
    expect(strokes.some((stroke) => stroke.strokeStyle === "#22c55e")).toBe(false);
    expect(dots.some((dot) => dot.radius === 6)).toBe(false);
  });
});
