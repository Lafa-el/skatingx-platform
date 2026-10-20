/**
 * Deterministic, non-identifying pose clips for the Landmarker spike.
 * Figures are flat mannequins drawn from known joint coordinates. No photo,
 * no face, no name, and no real video bytes.
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const FRAME_WIDTH = 640;
export const FRAME_HEIGHT = 480;

const SUIT = { r: 36, g: 72, b: 120, a: 255 };
const SUIT_EDGE = { r: 12, g: 24, b: 42, a: 255 };
const SKIN = { r: 214, g: 176, b: 148, a: 255 };
const SKIN_EDGE = { r: 140, g: 104, b: 84, a: 255 };
const ICE_TOP = { r: 214, g: 230, b: 238, a: 255 };
const ICE_BOTTOM = { r: 176, g: 204, b: 216, a: 255 };
const LINE = { r: 244, g: 248, b: 252, a: 255 };

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type);
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

export function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const start = y * (stride + 1);
    raw[start] = 0;
    rgba.copy(raw, start + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function point(x, y, visibility = 0.99) {
  return {
    x: Math.round(x * 1e6) / 1e6,
    y: Math.round(y * 1e6) / 1e6,
    visibility,
  };
}

/**
 * 33 BlazePose landmarks for one featureless mannequin.
 * scale is body height in normalized units. lean shifts the shoulders
 * relative to the hips (image-left is a positive lean here).
 */
export function skaterLandmarks({ centerX, kneeBend, lean, scale = 0.78, hipY = 0.56 }) {
  const shoulderY = hipY - scale * 0.34;
  const noseY = shoulderY - scale * 0.16;
  const lHipX = centerX - scale * 0.055;
  const rHipX = centerX + scale * 0.055;
  const lShX = lHipX - lean;
  const rShX = rHipX - lean;
  const midShX = (lShX + rShX) / 2;
  const noseX = midShX - scale * 0.02;

  const lKneeX = lHipX - scale * (0.05 + 0.05 * kneeBend);
  const lKneeY = hipY + scale * 0.2;
  const lAnkleX = lHipX - scale * 0.01;
  const lAnkleY = hipY + scale * 0.42;

  const rKneeX = rHipX + scale * (0.09 - 0.02 * kneeBend);
  const rKneeY = hipY + scale * 0.22;
  const rAnkleX = rHipX + scale * 0.16;
  const rAnkleY = hipY + scale * 0.36;

  const lElbX = lShX - scale * 0.11;
  const lElbY = shoulderY + scale * 0.16;
  const lWrX = lElbX - scale * 0.05;
  const lWrY = lElbY + scale * 0.11;
  const rElbX = rShX + scale * 0.12;
  const rElbY = shoulderY + scale * 0.14;
  const rWrX = rElbX + scale * 0.04;
  const rWrY = rElbY + scale * 0.1;

  const landmarks = Array.from({ length: 33 }, () => null);
  landmarks[0] = point(noseX, noseY);
  landmarks[1] = point(noseX - scale * 0.018, noseY - scale * 0.012);
  landmarks[2] = point(noseX - scale * 0.03, noseY - scale * 0.01);
  landmarks[3] = point(noseX - scale * 0.042, noseY - scale * 0.004);
  landmarks[4] = point(noseX + scale * 0.008, noseY - scale * 0.012);
  landmarks[5] = point(noseX + scale * 0.02, noseY - scale * 0.01);
  landmarks[6] = point(noseX + scale * 0.032, noseY - scale * 0.004);
  landmarks[7] = point(noseX - scale * 0.05, noseY + scale * 0.01);
  landmarks[8] = point(noseX + scale * 0.04, noseY + scale * 0.01);
  landmarks[9] = point(noseX - scale * 0.012, noseY + scale * 0.02);
  landmarks[10] = point(noseX + scale * 0.012, noseY + scale * 0.02);
  landmarks[11] = point(lShX, shoulderY);
  landmarks[12] = point(rShX, shoulderY);
  landmarks[13] = point(lElbX, lElbY);
  landmarks[14] = point(rElbX, rElbY);
  landmarks[15] = point(lWrX, lWrY);
  landmarks[16] = point(rWrX, rWrY);
  landmarks[17] = point(lWrX - scale * 0.012, lWrY + scale * 0.01);
  landmarks[18] = point(rWrX + scale * 0.012, rWrY + scale * 0.01);
  landmarks[19] = point(lWrX - scale * 0.004, lWrY + scale * 0.02);
  landmarks[20] = point(rWrX + scale * 0.004, rWrY + scale * 0.02);
  landmarks[21] = point(lWrX + scale * 0.008, lWrY + scale * 0.008);
  landmarks[22] = point(rWrX - scale * 0.008, rWrY + scale * 0.008);
  landmarks[23] = point(lHipX, hipY);
  landmarks[24] = point(rHipX, hipY);
  landmarks[25] = point(lKneeX, lKneeY);
  landmarks[26] = point(rKneeX, rKneeY);
  landmarks[27] = point(lAnkleX, lAnkleY);
  landmarks[28] = point(rAnkleX, rAnkleY);
  landmarks[29] = point(lAnkleX - scale * 0.01, lAnkleY + scale * 0.02);
  landmarks[30] = point(rAnkleX - scale * 0.01, rAnkleY + scale * 0.02);
  landmarks[31] = point(lAnkleX + scale * 0.03, lAnkleY + scale * 0.015);
  landmarks[32] = point(rAnkleX + scale * 0.03, rAnkleY + scale * 0.015);
  return landmarks;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function createImage() {
  const rgba = Buffer.alloc(FRAME_WIDTH * FRAME_HEIGHT * 4);
  for (let y = 0; y < FRAME_HEIGHT; y += 1) {
    const t = y / (FRAME_HEIGHT - 1);
    const r = Math.round(lerp(ICE_TOP.r, ICE_BOTTOM.r, t));
    const g = Math.round(lerp(ICE_TOP.g, ICE_BOTTOM.g, t));
    const b = Math.round(lerp(ICE_TOP.b, ICE_BOTTOM.b, t));
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      const i = (y * FRAME_WIDTH + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

function blend(rgba, x, y, color) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= FRAME_WIDTH || py >= FRAME_HEIGHT) return;
  const i = (py * FRAME_WIDTH + px) * 4;
  const a = color.a / 255;
  rgba[i] = Math.round(color.r * a + rgba[i] * (1 - a));
  rgba[i + 1] = Math.round(color.g * a + rgba[i + 1] * (1 - a));
  rgba[i + 2] = Math.round(color.b * a + rgba[i + 2] * (1 - a));
  rgba[i + 3] = 255;
}

function fillCircle(rgba, cx, cy, radius, color) {
  const r = Math.ceil(radius);
  const r2 = radius * radius;
  for (let y = -r; y <= r; y += 1) {
    for (let x = -r; x <= r; x += 1) {
      if (x * x + y * y <= r2) blend(rgba, cx + x, cy + y, color);
    }
  }
}

function stroke(rgba, x1, y1, x2, y2, radius, color) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(dist));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    fillCircle(rgba, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, radius, color);
  }
}

function px(landmark) {
  return [landmark.x * FRAME_WIDTH, landmark.y * FRAME_HEIGHT];
}

function drawSegment(rgba, landmarks, a, b, radius, fill, edge) {
  const [x1, y1] = px(landmarks[a]);
  const [x2, y2] = px(landmarks[b]);
  stroke(rgba, x1, y1, x2, y2, radius + 4, edge);
  stroke(rgba, x1, y1, x2, y2, radius, fill);
}

function drawFigure(rgba, landmarks) {
  const shoulderMid = {
    x: (landmarks[11].x + landmarks[12].x) / 2,
    y: (landmarks[11].y + landmarks[12].y) / 2,
  };
  const hipMid = {
    x: (landmarks[23].x + landmarks[24].x) / 2,
    y: (landmarks[23].y + landmarks[24].y) / 2,
  };
  for (const [a, b] of [
    [23, 25],
    [25, 27],
    [24, 26],
    [26, 28],
  ]) {
    drawSegment(rgba, landmarks, a, b, 16, SUIT, SUIT_EDGE);
  }
  const [hx1, hy1] = px(shoulderMid);
  const [hx2, hy2] = px(hipMid);
  stroke(rgba, hx1, hy1, hx2, hy2, 30, SUIT_EDGE);
  stroke(rgba, hx1, hy1, hx2, hy2, 24, SUIT);
  drawSegment(rgba, landmarks, 11, 12, 14, SUIT, SUIT_EDGE);
  drawSegment(rgba, landmarks, 23, 24, 14, SUIT, SUIT_EDGE);
  for (const [a, b] of [
    [11, 13],
    [13, 15],
    [12, 14],
    [14, 16],
  ]) {
    drawSegment(rgba, landmarks, a, b, 8, SUIT, SUIT_EDGE);
  }
  const [nx, ny] = px(landmarks[0]);
  stroke(rgba, nx, ny, hx1, hy1, 8, SKIN_EDGE);
  stroke(rgba, nx, ny, hx1, hy1, 5, SKIN);
  fillCircle(rgba, nx, ny, 26, SKIN_EDGE);
  fillCircle(rgba, nx, ny, 21, SKIN);
  for (const index of [15, 16, 27, 28]) {
    const [x, y] = px(landmarks[index]);
    fillCircle(rgba, x, y, index >= 27 ? 8 : 6, SKIN_EDGE);
    fillCircle(rgba, x, y, index >= 27 ? 5 : 4, SKIN);
  }
}

function drawRinkLines(rgba) {
  for (const yNorm of [0.72, 0.84]) {
    const y = Math.round(yNorm * FRAME_HEIGHT);
    for (let x = 24; x < FRAME_WIDTH - 24; x += 1) {
      for (let dy = -1; dy <= 1; dy += 1) blend(rgba, x, y + dy, LINE);
    }
  }
}

export function renderFrame(figures) {
  const rgba = createImage();
  drawRinkLines(rgba);
  for (const figure of figures) drawFigure(rgba, figure);
  return encodePng(FRAME_WIDTH, FRAME_HEIGHT, rgba);
}

function normalFrames() {
  const frames = [];
  for (let i = 0; i < 8; i += 1) {
    const t = i / 7;
    frames.push({
      figures: [
        skaterLandmarks({
          centerX: 0.5 + Math.sin(t * Math.PI) * 0.018,
          kneeBend: 0.15 + t * 0.7,
          lean: 0.05 + t * 0.025,
        }),
      ],
    });
  }
  return frames;
}

function emptyFrames() {
  return Array.from({ length: 4 }, () => ({ figures: [] }));
}

function multiFrames() {
  const frames = [];
  for (let i = 0; i < 6; i += 1) {
    const leftBig = i % 2 === 0;
    frames.push({
      figures: [
        skaterLandmarks({
          centerX: 0.3,
          kneeBend: 0.35,
          lean: 0.04,
          scale: leftBig ? 0.7 : 0.46,
          hipY: leftBig ? 0.54 : 0.6,
        }),
        skaterLandmarks({
          centerX: 0.72,
          kneeBend: 0.55,
          lean: 0.035,
          scale: leftBig ? 0.46 : 0.7,
          hipY: leftBig ? 0.6 : 0.54,
        }),
      ],
    });
  }
  return frames;
}

function jumpyFrames() {
  return [0.27, 0.71, 0.25, 0.69].map((centerX) => ({
    figures: [skaterLandmarks({ centerX, kneeBend: 0.4, lean: 0.055 })],
  }));
}

export function buildBatch() {
  return {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    deidentified: true,
    containsRealVideo: false,
    containsIdentifiablePerson: false,
    note: "Synthetic mannequins. No photograph, face, name, or real athlete.",
    clips: [
      {
        id: "fx-normal",
        scenario: "normal",
        description: "One mannequin, small translation, knee bend increases. Motion stays inside the Pose 0.5 jump gate.",
        frames: normalFrames(),
      },
      {
        id: "fx-no-person",
        scenario: "no-person",
        description: "Ice-colored background and rink lines only.",
        frames: emptyFrames(),
      },
      {
        id: "fx-multi-person",
        scenario: "multi-person",
        description: "Two mannequins. The larger one alternates left and right so a single-person detector can jump.",
        frames: multiFrames(),
      },
      {
        id: "fx-low-frame-rate",
        scenario: "low-frame-rate",
        description: "One mannequin sampled with large position jumps, standing in for a low frame rate.",
        frames: jumpyFrames(),
      },
    ],
  };
}

export function writeBatch(outDir) {
  const batch = buildBatch();
  const manifest = {
    width: batch.width,
    height: batch.height,
    deidentified: batch.deidentified,
    containsRealVideo: batch.containsRealVideo,
    containsIdentifiablePerson: batch.containsIdentifiablePerson,
    note: batch.note,
    clips: batch.clips.map((clip) => ({
      id: clip.id,
      scenario: clip.scenario,
      description: clip.description,
      frames: clip.frames.map((frame, index) => ({
        file: `${clip.id}/${String(index).padStart(3, "0")}.png`,
        figures: frame.figures,
      })),
    })),
  };
  for (const clip of batch.clips) {
    clip.frames.forEach((frame, index) => {
      const file = join(outDir, clip.id, `${String(index).padStart(3, "0")}.png`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, renderFrame(frame.figures));
    });
  }
  writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  return manifest;
}
