/**
 * Runs the Pose Landmarker spike in desktop Chrome against the synthetic batch.
 * Does not import the live biomechanics page and does not write Firestore.
 */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, rmSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { summarize, drawnClipPreview } from "./metrics.mjs";
import { writeBatch } from "./synthetic-batch.mjs";
import { vendorAssets } from "./vendor-assets.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const outDir = join(root, "scripts/spikes/pose-landmarker/out");
const frameDir = join(outDir, "frames");
const chromeBin = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".mjs") || file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".wasm")) return "application/wasm";
  if (file.endsWith(".webm")) return "video/webm";
  return "application/octet-stream";
}

function safeFile(rootDir, urlPath) {
  const relative = decodeURIComponent(urlPath).replace(/^\/+/, "");
  if (relative.includes("\0")) return null;
  const resolved = normalize(join(rootDir, relative));
  const base = normalize(rootDir);
  if (resolved !== base && !resolved.startsWith(`${base}/`)) return null;
  return resolved;
}

function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("body-too-large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function startServer(port) {
  const routes = [
    { prefix: "/fixtures/", root: frameDir },
    { prefix: "/mediapipe/", root: join(root, "apps/web/public/mediapipe") },
    { prefix: "/spike/", root: join(root, "scripts/spikes/pose-landmarker") },
  ];
  const requests = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      requests.push(`${request.method} ${url.pathname}`);
      if (request.method === "POST" && url.pathname === "/spike-status") {
        const body = await readBody(request, 100_000);
        writeFileSync(join(outDir, "status.txt"), body);
        response.writeHead(204);
        response.end();
        return;
      }
      if (request.method === "POST" && url.pathname === "/spike-result") {
        const stage = url.searchParams.get("stage");
        if (stage !== "pose05" && stage !== "landmarker") {
          response.writeHead(400);
          response.end();
          return;
        }
        const body = await readBody(request, 32_000_000);
        writeFileSync(join(outDir, `raw-${stage}.json`), body);
        response.writeHead(204);
        response.end();
        return;
      }
      if (request.method === "POST" && url.pathname === "/spike-video") {
        const clip = url.searchParams.get("clip") ?? "";
        if (!/^[a-z0-9-]+$/.test(clip)) {
          response.writeHead(400);
          response.end();
          return;
        }
        const body = await readBody(request, 64_000_000);
        mkdirSync(join(outDir, "videos"), { recursive: true });
        writeFileSync(join(outDir, "videos", `${clip}.webm`), body);
        response.writeHead(204);
        response.end();
        return;
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405);
        response.end();
        return;
      }
      const route = routes.find((item) => url.pathname.startsWith(item.prefix));
      if (!route) {
        response.writeHead(404);
        response.end();
        return;
      }
      const file = safeFile(route.root, url.pathname.slice(route.prefix.length));
      if (!file || !existsSync(file) || !statSync(file).isFile()) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, { "content-type": contentType(file) });
      response.end(request.method === "HEAD" ? undefined : readFileSync(file));
    } catch (error) {
      response.writeHead(500);
      response.end(error instanceof Error ? error.message : "server-error");
    }
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      resolve({ server, port, requests });
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForChrome(port) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // Chrome is still starting.
    }
    await sleep(200);
  }
  throw new Error("chrome-debug-port-unavailable");
}

function launchChrome(debuggingPort, pageUrl, headed) {
  const args = [
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=${join(outDir, "chrome-profile")}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-sync",
    "--autoplay-policy=no-user-gesture-required",
    "--use-angle=metal",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--window-size=1000,700",
    pageUrl,
  ];
  if (!headed) args.unshift("--headless=new");
  return spawn(chromeBin, args, {
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function runOnce(headed, stage) {
  const resultFile = join(outDir, `raw-${stage}.json`);
  rmSync(resultFile, { force: true });
  rmSync(join(outDir, "status.txt"), { force: true });
  rmSync(join(outDir, "chrome-profile"), { recursive: true, force: true });
  const hosting = await startServer(0);
  const address = hosting.server.address();
  if (!address || typeof address === "string") throw new Error("server-address-missing");
  const pageUrl = `http://127.0.0.1:${address.port}/spike/runner.html?stage=${stage}`;
  const chrome = launchChrome(9341, pageUrl, headed);
  const chromeLog = [];
  chrome.stdout.on("data", (chunk) => chromeLog.push(chunk.toString()));
  chrome.stderr.on("data", (chunk) => chromeLog.push(chunk.toString()));
  try {
    await waitForChrome(9341);
    const deadline = Date.now() + 12 * 60 * 1000;
    let lastStatus = "";
    while (Date.now() < deadline) {
      if (existsSync(resultFile)) break;
      if (chrome.exitCode !== null) throw new Error(`chrome-exited ${chrome.exitCode}`);
      const statusPath = join(outDir, "status.txt");
      if (existsSync(statusPath)) {
        const status = readFileSync(statusPath, "utf8").split("\n")[0];
        if (status !== lastStatus) {
          lastStatus = status;
          console.log(status);
        }
      }
      await sleep(500);
    }
    if (!existsSync(resultFile)) throw new Error(`spike-timed-out-${stage}`);
    return { requests: hosting.requests, chromeLog: chromeLog.join("").slice(-4000) };
  } finally {
    chrome.kill("SIGKILL");
    await new Promise((resolve) => {
      if (chrome.exitCode !== null) resolve();
      else chrome.once("exit", () => resolve());
    });
    await new Promise((resolve) => hosting.server.close(resolve));
  }
}

async function runStage(stage) {
  let lastError = "stage-failed";
  const attempts = process.env.SPIKE_HEADED === "0" ? [false] : [true, false];
  for (const headed of attempts) {
    console.log(`launching ${headed ? "headed" : "headless"} desktop Chrome for ${stage}`);
    try {
      const hosted = await runOnce(headed, stage);
      const raw = JSON.parse(readFileSync(join(outDir, `raw-${stage}.json`), "utf8"));
      if (!raw.error) return { hosted, raw };
      lastError = String(raw.error).split("\n")[0];
      console.log(lastError);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.log(lastError);
    }
  }
  throw new Error(lastError);
}

function compact(summary) {
  const lines = [];
  for (const [name, engine] of Object.entries(summary.engines)) {
    lines.push(
      `${name} delegate=${engine.delegate} wasm=${engine.wasm ?? ""} loadMs=${engine.loadMs} fallback=${JSON.stringify(engine.gpuFallback)}`,
    );
    for (const [clipId, clip] of Object.entries(engine.clips)) {
      const timing = engine.timing[clipId];
      lines.push(
        `  ${clipId} detected=${clip.detectedFrames}/${clip.frames} readable=${clip.readableFrames} bodyMae=${clip.versusDrawnFigure.bodyLandmarkMae} kneeMae=${clip.versusDrawnFigure.kneeMae} leanMae=${clip.versusDrawnFigure.leanMae} pelvisMae=${clip.versusDrawnFigure.pelvisMae} meanMs=${timing.meanMs}`,
      );
    }
  }
  lines.push(`recommendation ${summary.recommendation.tier}`);
  return lines.join("\n");
}

async function main() {
  if (!existsSync(chromeBin)) throw new Error("desktop-chrome-missing");
  mkdirSync(outDir, { recursive: true });
  console.log("vendoring self-hosted assets");
  const assets = await vendorAssets();
  writeFileSync(join(outDir, "assets.json"), `${JSON.stringify(assets, null, 2)}\n`);
  console.log("writing synthetic frames");
  const manifest = writeBatch(frameDir);
  const drawn = {
    "fx-normal": drawnClipPreview(manifest, "fx-normal").map((metrics) => ({
      readable: metrics.readable,
      kneeAngle: metrics.kneeAngle,
      leanAngle: metrics.leanAngle,
      pelvisPercent: metrics.pelvisPercent,
      reason: metrics.unreadableReason,
    })),
  };
  writeFileSync(join(outDir, "drawn-preview.json"), `${JSON.stringify(drawn, null, 2)}\n`);
  if (!drawn["fx-normal"].some((frame) => frame.readable)) {
    throw new Error("drawn-normal-clip-is-not-readable-by-production-metrics");
  }
  const reusePose = process.env.SPIKE_REUSE_POSE === "1" && existsSync(join(outDir, "raw-pose05.json"));
  const poseStage = reusePose
    ? {
        raw: JSON.parse(readFileSync(join(outDir, "raw-pose05.json"), "utf8")),
        hosted: { requests: [] },
      }
    : await runStage("pose05");
  if (poseStage.raw.error) throw new Error(poseStage.raw.error);
  const poseRaw = poseStage.raw;
  const poseHosted = poseStage.hosted;
  const landStage = await runStage("landmarker");
  const landRaw = landStage.raw;
  const landHosted = landStage.hosted;
  const raw = {
    userAgent: poseRaw.userAgent,
    hardwareConcurrency: poseRaw.hardwareConcurrency,
    webgl: landRaw.webgl ?? poseRaw.webgl,
    externalRequests: [...(poseRaw.externalRequests ?? []), ...(landRaw.externalRequests ?? [])],
    videos: poseRaw.videos,
    engines: { ...poseRaw.engines, ...landRaw.engines },
  };
  const hosted = {
    requests: [...poseHosted.requests, ...landHosted.requests],
  };
  const summary = summarize(raw, manifest);
  const output = {
    measuredAt: new Date().toISOString(),
    environment: {
      userAgent: raw.userAgent,
      hardwareConcurrency: raw.hardwareConcurrency,
      webgl: raw.webgl,
      poseWebgl: poseRaw.webgl,
      realDeviceGate: false,
      note: "Desktop Chrome on this machine. Not a skating-session device gate.",
    },
    externalRequests: raw.externalRequests,
    videos: raw.videos,
    localRequests: hosted.requests.filter((line) => line.startsWith("GET")),
    assets,
    drawn,
    recommendation: summary.recommendation,
    engines: summary.engines,
  };
  writeFileSync(join(outDir, "summary.json"), `${JSON.stringify(output, null, 2)}\n`);
  console.log(compact(summary));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
