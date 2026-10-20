/**
 * Copies the pinned Tasks Vision library and WASM, and the float16 revision-1
 * Pose Landmarker models, into the self-hosted public path. Nothing here is
 * referenced by the live biomechanics page. prebuild does not run this script.
 */

import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
export const LANDMARKER_VERSION = "1.1.1";
export const LANDMARKER_DIR = join(
  root,
  "apps/web/public/mediapipe/pose-landmarker",
  LANDMARKER_VERSION,
);

const MODEL_PINS = [
  {
    file: "pose_landmarker_lite.task",
    url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
    sha256: "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a",
  },
  {
    file: "pose_landmarker_full.task",
    url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
    sha256: "5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1",
  },
  {
    file: "pose_landmarker_heavy.task",
    url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task",
    sha256: "64437af838a65d18e5ba7a0d39b465540069bc8aae8308de3e318aad31fcbc7b",
  },
];

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`model-download-failed ${response.status} ${url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, bytes);
}

export async function vendorAssets() {
  const poseCopy = spawnSync(process.execPath, ["scripts/copy-pose-assets.mjs"], {
    cwd: root,
    encoding: "utf8",
  });
  if (poseCopy.status !== 0) {
    throw new Error(poseCopy.stderr || poseCopy.stdout || "pose-asset-copy-failed");
  }

  const require = createRequire(import.meta.url);
  const packageDir = dirname(require.resolve("@mediapipe/tasks-vision"));
  mkdirSync(join(LANDMARKER_DIR, "wasm"), { recursive: true });
  cpSync(join(packageDir, "vision_bundle.mjs"), join(LANDMARKER_DIR, "vision_bundle.mjs"));
  cpSync(join(packageDir, "wasm"), join(LANDMARKER_DIR, "wasm"), { recursive: true });

  const recorded = [];
  recorded.push({
    file: "vision_bundle.mjs",
    bytes: readFileSync(join(LANDMARKER_DIR, "vision_bundle.mjs")).length,
    sha256: sha256(join(LANDMARKER_DIR, "vision_bundle.mjs")),
  });
  for (const name of [
    "vision_wasm_internal.js",
    "vision_wasm_internal.wasm",
    "vision_wasm_nosimd_internal.js",
    "vision_wasm_nosimd_internal.wasm",
    "vision_wasm_module_internal.js",
    "vision_wasm_module_internal.wasm",
  ]) {
    const file = join(LANDMARKER_DIR, "wasm", name);
    recorded.push({ file: `wasm/${name}`, bytes: readFileSync(file).length, sha256: sha256(file) });
  }

  for (const pin of MODEL_PINS) {
    const destination = join(LANDMARKER_DIR, pin.file);
    if (!existsSync(destination) || sha256(destination) !== pin.sha256) {
      await download(pin.url, destination);
    }
    const hash = sha256(destination);
    if (hash !== pin.sha256) {
      throw new Error(`model-hash-mismatch ${pin.file}`);
    }
    recorded.push({
      file: pin.file,
      bytes: readFileSync(destination).length,
      sha256: hash,
      sourceUrlUsedAtVendoringTimeOnly: pin.url,
    });
  }

  return {
    version: LANDMARKER_VERSION,
    directory: "apps/web/public/mediapipe/pose-landmarker/1.1.1",
    files: recorded,
  };
}
