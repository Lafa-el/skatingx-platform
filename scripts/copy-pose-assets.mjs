import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Copies the pinned @mediapipe/pose@0.5.1675469404 files the page will request
 * into the web app's public directory. Runtime locateFile stays on this origin.
 * lite and heavy models are not copied: modelComplexity 1 uses the full tflite.
 */
const require = createRequire(import.meta.url);
const source = dirname(require.resolve("@mediapipe/pose/package.json"));
const destination = join(
  dirname(fileURLToPath(import.meta.url)),
  "../apps/web/public/mediapipe/pose/0.5.1675469404",
);

const files = [
  "pose.js",
  "pose_landmark_full.tflite",
  "pose_solution_packed_assets.data",
  "pose_solution_packed_assets_loader.js",
  "pose_solution_simd_wasm_bin.js",
  "pose_solution_simd_wasm_bin.wasm",
  "pose_solution_wasm_bin.js",
  "pose_solution_wasm_bin.wasm",
  "pose_web.binarypb",
];

mkdirSync(destination, { recursive: true });
for (const file of files) {
  cpSync(join(source, file), join(destination, file));
}
