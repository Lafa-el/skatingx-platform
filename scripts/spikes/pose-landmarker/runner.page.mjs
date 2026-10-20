const externalRequests = [];
const ASSET_VERSION = "1.1.1";
const POSE05_DIR = "/mediapipe/pose/0.5.1675469404";

function isLocal(url) {
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

function noteExternal(url) {
  externalRequests.push(String(url));
}

const originalFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!isLocal(url)) {
    noteExternal(url);
    return Promise.resolve(new Response("", { status: 204 }));
  }
  return originalFetch(input, init);
};

const OriginalXHR = window.XMLHttpRequest;
window.XMLHttpRequest = function PatchedXHR() {
  const xhr = new OriginalXHR();
  const originalOpen = xhr.open;
  const originalSend = xhr.send;
  xhr.open = function open(method, url, ...rest) {
    if (!isLocal(url)) {
      noteExternal(url);
      xhr.__blocked = true;
      return undefined;
    }
    return originalOpen.call(xhr, method, url, ...rest);
  };
  xhr.send = function send(body) {
    if (xhr.__blocked) {
      window.setTimeout(() => {
        Object.defineProperty(xhr, "status", { value: 204 });
        Object.defineProperty(xhr, "readyState", { value: 4 });
        xhr.dispatchEvent(new Event("load"));
        if (typeof xhr.onload === "function") xhr.onload();
      }, 0);
      return undefined;
    }
    return originalSend.call(xhr, body);
  };
  return xhr;
};

if (typeof navigator.sendBeacon === "function") {
  navigator.sendBeacon = (url) => {
    noteExternal(url);
    return true;
  };
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function setStatus(text) {
  const node = document.getElementById("status");
  if (node) node.textContent = text;
  console.log(text);
}

async function postStatus(text) {
  setStatus(text);
  await fetch("/spike-status", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: text,
  }).catch(() => undefined);
}

function packLandmarks(landmarks) {
  if (!landmarks || landmarks.length === 0) return null;
  const packed = Array.from({ length: 33 }, () => null);
  landmarks.forEach((point, index) => {
    if (!point || index > 32) return;
    packed[index] = {
      x: point.x,
      y: point.y,
      visibility: typeof point.visibility === "number" ? point.visibility : 0,
    };
  });
  return packed.some((point) => point) ? packed : null;
}

function webglInfo() {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  if (!gl) return { renderer: null, vendor: null };
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const info = {
    renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
    vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
  };
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return info;
}

async function loadImageCanvas(url) {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas-2d-missing");
  context.drawImage(image, 0, 0);
  return canvas;
}

async function recordClip(canvases) {
  if (typeof MediaRecorder === "undefined" || canvases.length === 0) {
    return { bytes: 0, error: "media-recorder-missing" };
  }
  const canvas = document.createElement("canvas");
  canvas.width = canvases[0].width;
  canvas.height = canvases[0].height;
  const context = canvas.getContext("2d");
  if (!context) return { bytes: 0, error: "canvas-2d-missing" };
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
    ? "video/webm;codecs=vp8"
    : "video/webm";
  const recorder = new MediaRecorder(canvas.captureStream(10), { mimeType });
  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.start();
  for (const frame of canvases) {
    context.drawImage(frame, 0, 0);
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  recorder.stop();
  await stopped;
  const blob = new Blob(chunks, { type: mimeType });
  return { bytes: blob.size, mimeType, blob };
}

function loadPoseScript() {
  if (window.Pose) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${POSE05_DIR}/pose.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("pose-script-missing"));
    document.head.appendChild(script);
  });
}

function poseLocateFile(forceNosimd) {
  return (file) => {
    const name = forceNosimd ? file.replaceAll("simd_", "") : file;
    return `${POSE05_DIR}/${name}`;
  };
}

async function sendPose(pose, canvas) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("pose-frame-timeout")), 30000);
    pose.onResults((results) => {
      window.clearTimeout(timer);
      resolve(results);
    });
    pose.send({ image: canvas }).catch((error) => {
      window.clearTimeout(timer);
      reject(error);
    });
  });
}

async function createPose05(warmupCanvas) {
  await loadPoseScript();
  const Pose = window.Pose;
  if (!Pose) throw new Error("pose-script-missing");
  let forceNosimd = false;
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const started = performance.now();
    const pose = new Pose({ locateFile: poseLocateFile(forceNosimd) });
    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try {
      await sendPose(pose, warmupCanvas);
      return {
        pose,
        loadMs: performance.now() - started,
        wasm: forceNosimd ? "nosimd" : "simd",
      };
    } catch (error) {
      lastError = error;
      await Promise.resolve(pose.close()).catch(() => undefined);
      if (forceNosimd) break;
      forceNosimd = true;
      await postStatus("pose 0.5 simd warmup failed, retrying nosimd");
    }
  }
  throw lastError instanceof Error ? lastError : new Error("pose-warmup-failed");
}

async function runPose05Clip(pose, canvases) {
  const frames = [];
  for (let index = 0; index < canvases.length; index += 1) {
    const started = performance.now();
    const results = await sendPose(pose, canvases[index]);
    frames.push({
      inferenceMs: performance.now() - started,
      landmarks: packLandmarks(results.poseLandmarks),
    });
  }
  return frames;
}

async function createLandmarker(PoseLandmarker, FilesetResolver, tier, delegate) {
  const started = performance.now();
  const fileset = await FilesetResolver.forVisionTasks(`/mediapipe/pose-landmarker/${ASSET_VERSION}/wasm`);
  const options = {
    baseOptions: {
      modelAssetPath: `/mediapipe/pose-landmarker/${ASSET_VERSION}/pose_landmarker_${tier}.task`,
      delegate,
    },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };
  if (delegate === "GPU") {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    canvas.hidden = true;
    document.body.appendChild(canvas);
    options.canvas = canvas;
  }
  const landmarker = await withTimeout(
    PoseLandmarker.createFromOptions(fileset, options),
    45000,
    `landmarker-${tier}-${delegate}-timeout`,
  );
  return { landmarker, loadMs: performance.now() - started, canvas: options.canvas ?? null };
}

function runLandmarkerClip(landmarker, canvases) {
  const frames = [];
  for (let index = 0; index < canvases.length; index += 1) {
    const started = performance.now();
    const result = landmarker.detectForVideo(canvases[index], index * 180);
    frames.push({
      inferenceMs: performance.now() - started,
      landmarks: packLandmarks(result.landmarks?.[0] ?? null),
    });
  }
  return frames;
}

async function runLandmarkerTier(PoseLandmarker, FilesetResolver, tier, clips, canvasesByClip) {
  let delegate = "GPU";
  let gpuFallback = null;
  const clipLoadMs = [];
  const clipsOut = {};
  for (const clip of clips) {
    let created;
    try {
      created = await createLandmarker(PoseLandmarker, FilesetResolver, tier, delegate);
    } catch (error) {
      if (delegate !== "GPU") throw error;
      gpuFallback = { error: error instanceof Error ? error.message : String(error) };
      delegate = "CPU";
      await postStatus(`${tier} GPU init failed, using CPU`);
      created = await createLandmarker(PoseLandmarker, FilesetResolver, tier, "CPU");
    }
    clipLoadMs.push(created.loadMs);
    try {
      clipsOut[clip.id] = runLandmarkerClip(created.landmarker, canvasesByClip[clip.id]);
    } catch (error) {
      created.landmarker.close();
      if (created.canvas) created.canvas.remove();
      if (delegate !== "GPU") throw error;
      gpuFallback = { error: error instanceof Error ? error.message : String(error), stage: "detect" };
      delegate = "CPU";
      await postStatus(`${tier} GPU detect failed, using CPU`);
      created = await createLandmarker(PoseLandmarker, FilesetResolver, tier, "CPU");
      clipLoadMs.push(created.loadMs);
      clipsOut[clip.id] = runLandmarkerClip(created.landmarker, canvasesByClip[clip.id]);
    }
    created.landmarker.close();
    if (created.canvas) created.canvas.remove();
  }
  return {
    delegate,
    gpuFallback,
    loadMs: clipLoadMs[0] ?? null,
    clipLoadMs,
    clips: clipsOut,
  };
}

async function main() {
  const stage = new URLSearchParams(location.search).get("stage") ?? "pose05";
  const manifest = await fetch("/fixtures/manifest.json").then((response) => {
    if (!response.ok) throw new Error("manifest-missing");
    return response.json();
  });
  const canvasesByClip = {};
  const videos = [];
  for (const clip of manifest.clips) {
    await postStatus(`loading ${clip.id}`);
    const canvases = [];
    for (const frame of clip.frames) {
      canvases.push(await loadImageCanvas(`/fixtures/${frame.file}`));
    }
    canvasesByClip[clip.id] = canvases;
  }

  const engines = {};
  if (stage === "pose05") {
  await postStatus("running pose 0.5");
  const poseClips = {};
  const created = await createPose05(canvasesByClip[manifest.clips[0].id][0]);
  try {
    for (const clip of manifest.clips) {
      await postStatus(`pose 0.5 ${clip.id}`);
      poseClips[clip.id] = await runPose05Clip(created.pose, canvasesByClip[clip.id]);
    }
  } finally {
    await created.pose.close();
  }
  for (const clip of manifest.clips) {
    const recorded = await recordClip(canvasesByClip[clip.id]);
    if (recorded.blob) {
      await fetch(`/spike-video?clip=${encodeURIComponent(clip.id)}`, {
        method: "POST",
        headers: { "content-type": recorded.mimeType },
        body: recorded.blob,
      });
    }
    videos.push({ id: clip.id, bytes: recorded.bytes, error: recorded.error ?? null });
  }
  const poseLoad = [created.loadMs];

  engines.pose05 = {
    delegate: "solution-api",
    wasm: created.wasm,
    gpuFallback: null,
    loadMs: poseLoad[0] ?? null,
    clipLoadMs: poseLoad,
    clips: poseClips,
  };
  }

  if (stage === "landmarker") {
  const vision = await import(`/mediapipe/pose-landmarker/${ASSET_VERSION}/vision_bundle.mjs`);
  for (const tier of ["lite", "full", "heavy"]) {
    await postStatus(`running landmarker ${tier}`);
    engines[tier] = await runLandmarkerTier(
      vision.PoseLandmarker,
      vision.FilesetResolver,
      tier,
      manifest.clips,
      canvasesByClip,
    );
  }
  }

  const result = {
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    webgl: webglInfo(),
    externalRequests,
    videos,
    engines,
  };
  const posted = await fetch(`/spike-result?stage=${encodeURIComponent(stage)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(result),
  });
  if (!posted.ok) throw new Error("result-post-failed");
  window.__SPIKE_DONE__ = "ok";
  await postStatus("done");
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  window.__SPIKE_DONE__ = "error";
  await postStatus(`error ${message}`);
  const stage = new URLSearchParams(location.search).get("stage") ?? "pose05";
  await fetch(`/spike-result?stage=${encodeURIComponent(stage)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ error: message, externalRequests }),
  }).catch(() => undefined);
});
