import {
  aggregateKeyframes,
  analysisCrop,
  appendKeyframe,
  assessVideoInput,
  buildBiomechAnalysisRecord,
  emptySupportTracker,
  emptyTrackingState,
  formatFixed,
  lockTarget,
  mapLandmarksFromCrop,
  resetAnalysisSession,
  rotatePoint,
  samplePoseFrame,
  shouldSendPoseFrame,
  videoPointer,
  type PoseFrameMetrics,
  type PoseKeyframeSample,
  type SupportOverride,
  type SupportTracker,
  type TrackingState,
} from "@skatingx/skating-domain";
import { getFirestoreDb, saveBiomechAnalysisRecord } from "@skatingx/firebase-client";
import { Button, Card } from "@skatingx/ui";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useLocale } from "@/hooks/useLocale";
import { tAnalysis } from "@/shared/i18n/analysis-messages";
import { tBiomech, type BiomechMessageKey } from "@/shared/i18n/biomech-messages";
import { logActionFailure } from "@/shared/utils/logActionFailure";

import { clockOf, drawPoseOverlay, frameCanvasSize, supportOverlaySide } from "./pose-overlay";
import {
  POSE_WARMUP_TIMEOUT_MS,
  loadPoseEngine,
  prefetchPoseAssets,
  releasePoseEngine,
  type PoseEngine,
  type PoseLandmark,
  type PoseWarmupStage,
} from "./pose-engine";

const SPEEDS = [
  { value: "1", key: "biomech.speed.full" },
  { value: "0.5", key: "biomech.speed.half" },
  { value: "0.25", key: "biomech.speed.quarter" },
  { value: "0.1", key: "biomech.speed.tenth" },
] as const satisfies readonly { value: string; key: BiomechMessageKey }[];

const SUPPORT = [
  { value: "auto", key: "biomech.support.auto" },
  { value: "left", key: "biomech.support.left" },
  { value: "right", key: "biomech.support.right" },
] as const satisfies readonly { value: SupportOverride; key: BiomechMessageKey }[];

type ModelPhase = "loading-engine" | "loading-model" | "initializing" | "ready" | "failed";

const MODEL_KEY: Record<ModelPhase, BiomechMessageKey> = {
  "loading-engine": "biomech.console.loadingEngine",
  "loading-model": "biomech.console.loadingModel",
  initializing: "biomech.console.initializing",
  ready: "biomech.console.ready",
  failed: "biomech.console.failed",
};

const STAGE_PHASE: Record<PoseWarmupStage, ModelPhase> = {
  loadScript: "loading-engine",
  construct: "loading-model",
  warmupSend: "initializing",
};

const BLANK_METRICS: PoseFrameMetrics = {
  readable: false,
  unreadableReason: null,
  kneeDisplay: "--°",
  leanDisplay: "--°",
  pelvisDisplay: "--%",
  recoveryDisplay: "--",
  keyframeText: null,
  liveHoldText: null,
  issue: null,
  kneeAngle: null,
  leanAngle: null,
  supportSide: null,
  supportConfidence: null,
};

function reasonKey(reason: PoseKeyframeSample["unreadableReason"]): BiomechMessageKey {
  if (reason === "no-pose") return "biomech.unreadable.noPose";
  if (reason === "occlusion-or-jump") return "biomech.unreadable.jump";
  if (reason === "support-leg-uncertain") return "biomech.unreadable.support";
  if (reason === "keypoint-missing") return "biomech.unreadable.missing";
  return "biomech.unreadable.send";
}

export function BiomechanicsPage() {
  const locale = useLocale();
  const { uid } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const paintRef = useRef<HTMLCanvasElement>(null);
  const sendRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PoseEngine | null>(null);
  const trackingRef = useRef<TrackingState>(emptyTrackingState());
  const supportRef = useRef<SupportTracker>(emptySupportTracker());
  const cropRef = useRef(analysisCrop({ locked: false, jumpRejects: 0, target: null }));
  const rollRef = useRef(0);
  const modeRef = useRef<SupportOverride>("auto");
  const pendingRef = useRef(false);
  const lockedRef = useRef(false);
  const loopRef = useRef(0);
  const runRef = useRef(0);
  const lastSentRef = useRef(0);
  const inFlightRef = useRef(false);
  const warmupTimerRef = useRef(0);

  const [fileName, setFileName] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(true);
  const [roll, setRoll] = useState(0);
  const [calibrationMoved, setCalibrationMoved] = useState(false);
  const [grid, setGrid] = useState(false);
  const [supportMode, setSupportMode] = useState<SupportOverride>("auto");
  const [speed, setSpeed] = useState("0.25");
  const [locked, setLocked] = useState(false);
  const [model, setModel] = useState<ModelPhase>("loading-engine");
  const [live, setLive] = useState<PoseFrameMetrics>(BLANK_METRICS);
  const [samples, setSamples] = useState<readonly PoseKeyframeSample[]>([]);
  const [feedback, setFeedback] = useState<BiomechMessageKey>("biomech.feedback.waiting");
  const [feedbackSide, setFeedbackSide] = useState<BiomechMessageKey>("biomech.support.left");
  const [status, setStatus] = useState<BiomechMessageKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [clock, setClock] = useState("00:00");
  const [duration, setDuration] = useState("00:00");

  const ready = assessVideoInput({
    byteLength: fileName ? 1 : 0,
    decodable: fileName !== null,
  });
  const db = getFirestoreDb();
  const syncKey: BiomechMessageKey = !db
    ? "biomech.sync.missing"
    : uid
      ? "biomech.sync.on"
      : "biomech.sync.off";
  const aggregate = aggregateKeyframes(samples);
  const calibrationKey: BiomechMessageKey = !calibrationMoved
    ? "biomech.calibration.detecting"
    : Math.abs(roll) <= 1
      ? "biomech.calibration.aligned"
      : "biomech.calibration.manual";

  useEffect(() => {
    prefetchPoseAssets();
  }, []);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(loopRef.current);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  useEffect(() => {
    return () => {
      runRef.current += 1;
      window.clearTimeout(warmupTimerRef.current);
      cancelAnimationFrame(loopRef.current);
      void releasePoseEngine().catch((error: unknown) => {
        logActionFailure("biomechanics", "close", error);
      });
    };
  }, []);

  const paint = (landmarks: readonly PoseLandmark[] | null, supportSide: "left" | "right" | null) => {
    const canvas = paintRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const width = video.videoWidth || canvas.clientWidth || 16;
    const height = video.videoHeight || canvas.clientHeight || 9;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    drawPoseOverlay(context, width, height, { roll: rollRef.current, grid, landmarks, supportSide });
  };

  const acceptLandmarks = (landmarks: PoseLandmark[] | null) => {
    const mapped = landmarks ? mapLandmarksFromCrop(landmarks, cropRef.current) : null;
    const rolled =
      mapped && Math.abs(rollRef.current) > 0.01
        ? mapped.map((point) => rotatePoint(point, -rollRef.current))
        : mapped;
    const list = rolled ? Array.from({ length: 33 }, (_, index) => rolled[index] ?? null) : null;
    const mode = pendingRef.current ? modeRef.current : "auto";
    const video = videoRef.current;
    const result = samplePoseFrame({
      tracking: trackingRef.current,
      support: supportRef.current,
      landmarks: list,
      timeSeconds: video?.currentTime ?? 0,
      supportMode: mode,
    });
    trackingRef.current = result.tracking;
    supportRef.current = result.support;
    setLive(result.live);
    paint(mapped, supportOverlaySide(result.sample));
    if (!pendingRef.current) return;
    pendingRef.current = false;
    setSamples((current) => appendKeyframe(current, result.sample));
    setFeedback("biomech.feedback.waiting");
  };

  const sendCurrent = async () => {
    const video = videoRef.current;
    const engine = engineRef.current;
    const canvas = sendRef.current;
    if (!video || !engine || !canvas || video.readyState < 2) return;
    const crop = analysisCrop({
      locked: lockedRef.current,
      jumpRejects: trackingRef.current.poseJumpRejectCount,
      target: trackingRef.current.lastTargetCom,
    });
    cropRef.current = crop;
    const box = frameCanvasSize(video, crop);
    canvas.width = box.width;
    canvas.height = box.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, box.sx, box.sy, box.sw, box.sh, 0, 0, box.width, box.height);
    await engine.send(canvas);
  };

  const startLoop = () => {
    cancelAnimationFrame(loopRef.current);
    const tick = (now: number) => {
      const video = videoRef.current;
      if (!video || video.paused || video.ended) return;
      if (
        engineRef.current &&
        shouldSendPoseFrame({
          nowMs: now,
          lastPoseFrameAt: lastSentRef.current,
          inFlight: inFlightRef.current,
        })
      ) {
        lastSentRef.current = now;
        inFlightRef.current = true;
        void sendCurrent()
          .catch((error: unknown) => {
            logActionFailure("biomechanics", "frame", error);
          })
          .finally(() => {
            inFlightRef.current = false;
          });
      }
      const total = video.duration;
      if (Number.isFinite(total) && total > 0) {
        setClock(clockOf({ timeSeconds: video.currentTime }));
        setDuration(clockOf({ timeSeconds: total }));
      }
      loopRef.current = requestAnimationFrame(tick);
    };
    loopRef.current = requestAnimationFrame(tick);
  };

  const chooseFile = (file: File | undefined) => {
    if (!file) return;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    const next = URL.createObjectURL(file);
    setObjectUrl(next);
    setFileName(file.name);
    setStarted(false);
    const video = videoRef.current;
    if (video) video.src = next;
  };

  const reset = () => {
    runRef.current += 1;
    window.clearTimeout(warmupTimerRef.current);
    const session = resetAnalysisSession({
      started,
      objectUrl,
      keyframes: samples.map((sample) => ({ id: String(sample.timeSeconds) })),
      kneeDisplay: live.kneeDisplay,
      leanDisplay: live.leanDisplay,
      pelvisDisplay: live.pelvisDisplay,
      recoveryDisplay: live.recoveryDisplay,
      poseInstanceOpen: engineRef.current !== null,
    });
    cancelAnimationFrame(loopRef.current);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute("src");
    }
    if (fileRef.current) fileRef.current.value = "";
    trackingRef.current = emptyTrackingState();
    supportRef.current = emptySupportTracker();
    pendingRef.current = false;
    lockedRef.current = false;
    engineRef.current = null;
    setObjectUrl(null);
    setFileName(null);
    setStarted(false);
    setPaused(true);
    setLocked(false);
    setSamples([]);
    setLive(BLANK_METRICS);
    setSupportMode("auto");
    modeRef.current = "auto";
    setFeedback("biomech.feedback.waiting");
    setModel("loading-engine");
    setClock("00:00");
    setDuration("00:00");
    if (session.poseClosed) {
      void releasePoseEngine().catch((error: unknown) => {
        logActionFailure("biomechanics", "close", error);
      });
    }
  };

  const clearWarmupTimer = () => {
    window.clearTimeout(warmupTimerRef.current);
    warmupTimerRef.current = 0;
  };

  const beginWarmup = async (run: number): Promise<boolean> => {
    clearWarmupTimer();
    setModel("loading-engine");
    let expired = false;
    warmupTimerRef.current = window.setTimeout(() => {
      expired = true;
      if (run === runRef.current) setModel("failed");
    }, POSE_WARMUP_TIMEOUT_MS);
    try {
      const engine = await loadPoseEngine(acceptLandmarks, {
        onStage(stage) {
          if (expired || run !== runRef.current) return;
          setModel(STAGE_PHASE[stage]);
        },
      });
      if (expired || run !== runRef.current) {
        await engine.close();
        return false;
      }
      clearWarmupTimer();
      engineRef.current = engine;
      setModel("ready");
      return true;
    } catch (error) {
      clearWarmupTimer();
      if (run !== runRef.current) return false;
      logActionFailure("biomechanics", "model", error);
      setModel("failed");
      return false;
    }
  };

  const playStarted = async (run: number) => {
    const video = videoRef.current;
    if (!video || run !== runRef.current) return;
    video.playbackRate = Number(speed);
    await video.play().catch((error: unknown) => {
      logActionFailure("biomechanics", "play", error);
    });
    if (run !== runRef.current) return;
    setPaused(false);
    startLoop();
  };

  const start = async () => {
    if (started) {
      reset();
      return;
    }
    const video = videoRef.current;
    if (!video || !objectUrl) return;
    const run = runRef.current;
    setStarted(true);
    setStatus(null);
    const readyEngine = await beginWarmup(run);
    if (!readyEngine) return;
    await playStarted(run);
  };

  const retryWarmup = async () => {
    const video = videoRef.current;
    if (!video || !objectUrl) return;
    runRef.current += 1;
    const run = runRef.current;
    engineRef.current = null;
    clearWarmupTimer();
    await releasePoseEngine().catch((error: unknown) => {
      logActionFailure("biomechanics", "close", error);
    });
    if (run !== runRef.current) return;
    const readyEngine = await beginWarmup(run);
    if (!readyEngine) return;
    await playStarted(run);
  };

  const sample = () => {
    if (!lockedRef.current) {
      setFeedback("biomech.feedback.needTarget");
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setPaused(true);
    cancelAnimationFrame(loopRef.current);
    if (modeRef.current !== "auto") {
      setFeedback("biomech.feedback.manual");
      setFeedbackSide(modeRef.current === "left" ? "biomech.support.left" : "biomech.support.right");
    }
    pendingRef.current = true;
    if (!inFlightRef.current) {
      inFlightRef.current = true;
      void sendCurrent()
        .catch((error: unknown) => {
          logActionFailure("biomechanics", "sample", error);
          pendingRef.current = false;
          setFeedback("biomech.unreadable.send");
        })
        .finally(() => {
          inFlightRef.current = false;
        });
    }
  };

  const save = async () => {
    if (!uid) {
      setStatus("biomech.status.signedOut");
      return;
    }
    const database = getFirestoreDb();
    if (!database) {
      setStatus("biomech.status.unavailable");
      return;
    }
    setSaving(true);
    try {
      const record = buildBiomechAnalysisRecord({
        id: `biomech-${crypto.randomUUID()}`,
        ownerUserId: uid,
        createdAt: new Date().toISOString(),
        samples,
      });
      await saveBiomechAnalysisRecord(database, record);
      setStatus("biomech.status.saved");
    } catch (error) {
      logActionFailure("biomechanics", "save", error);
      setStatus("biomech.status.failed");
    } finally {
      setSaving(false);
    }
  };

  const modelKey = MODEL_KEY[model];

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <h1 className="text-2xl font-bold text-brand-navy">{tAnalysis(locale, "analysis.biomechanics.title")}</h1>
        <p className="text-sm text-brand-navy/80">{tBiomech(locale, "biomech.privacy")}</p>
      </header>

      <div className="grid gap-6 xl:grid-cols-12">
        <Card className="xl:col-span-4" title={tBiomech(locale, "biomech.heading")}>
          <div className="grid gap-4">
            <input
              ref={fileRef}
              type="file"
              accept="video/mp4,video/quicktime,video/*"
              className="sr-only"
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />
            {fileName ? (
              <div className="flex min-h-11 items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-brand-navy">{fileName}</p>
                  <p className="text-xs text-brand-navy/70">{tBiomech(locale, "biomech.upload.ready")}</p>
                </div>
                <Button variant="outline" onClick={reset}>
                  {tBiomech(locale, "biomech.upload.remove")}
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                {tBiomech(locale, "biomech.upload.prompt")}
              </Button>
            )}
            <p className="text-xs text-brand-navy/70">{tBiomech(locale, "biomech.upload.hint")}</p>

            <div className="grid gap-3 rounded-control border border-brand-navy/15 p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-brand-navy">{tBiomech(locale, "biomech.calibration.title")}</h3>
                <span className="text-xs text-brand-navy/70">{tBiomech(locale, calibrationKey)}</span>
              </div>
              <label className="grid gap-1 text-sm text-brand-navy">
                <span className="flex items-center justify-between">
                  {tBiomech(locale, "biomech.roll.label")}
                  <span className="font-mono">{formatFixed(roll, 1)}°</span>
                </span>
                <input
                  type="range"
                  min={-15}
                  max={15}
                  step={0.1}
                  value={roll}
                  className="min-h-11 w-full"
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    rollRef.current = next;
                    setRoll(next);
                    setCalibrationMoved(true);
                  }}
                />
              </label>
              <p className="text-xs text-brand-navy/70">{tBiomech(locale, "biomech.roll.help")}</p>
              <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-brand-navy">
                {tBiomech(locale, "biomech.grid")}
                <input
                  type="checkbox"
                  checked={grid}
                  onChange={(event) => setGrid(event.target.checked)}
                />
              </label>
            </div>

            <Button disabled={!started && !ready.analyzeEnabled} onClick={() => void start()}>
              {started
                ? tBiomech(locale, "biomech.action.reset")
                : tBiomech(locale, ready.analyzeEnabled ? "biomech.action.start" : "biomech.action.uploadFirst")}
            </Button>

            <div className="rounded-control border border-brand-navy/15 p-3 font-mono text-xs text-brand-navy">
              <p>
                {tBiomech(locale, "biomech.console.model")}：{tBiomech(locale, modelKey)}
              </p>
              {model === "failed" ? (
                <Button variant="outline" onClick={() => void retryWarmup()}>
                  {tBiomech(locale, "biomech.console.retry")}
                </Button>
              ) : null}
              <p>{tBiomech(locale, "biomech.console.calibration")}</p>
              <p>
                {tBiomech(locale, "biomech.console.sync")}：{tBiomech(locale, syncKey)}
              </p>
            </div>
          </div>
        </Card>

        <div className="xl:col-span-8">
          {!started ? (
            <Card title={tBiomech(locale, "biomech.empty.title")}>
              <p>{tBiomech(locale, "biomech.empty.body")}</p>
            </Card>
          ) : null}
          <div className={started ? undefined : "hidden"}>
            <Card title={tBiomech(locale, "biomech.telemetry")}>
              <div
                ref={viewRef}
                className="relative mt-4 aspect-video overflow-hidden rounded-control bg-brand-navy/90"
                onClick={(event) => {
                  const video = videoRef.current;
                  const box = viewRef.current?.getBoundingClientRect();
                  if (!video || !box || !started) return;
                  const point = videoPointer({
                    clientX: event.clientX,
                    clientY: event.clientY,
                    left: box.left,
                    top: box.top,
                    boxWidth: box.width,
                    boxHeight: box.height,
                    videoWidth: video.videoWidth,
                    videoHeight: video.videoHeight,
                  });
                  if (!point) return;
                  trackingRef.current = lockTarget(point);
                  lockedRef.current = true;
                  setLocked(true);
                }}
              >
                <video ref={videoRef} className="h-full w-full object-contain" playsInline muted src={objectUrl ?? undefined} />
                <canvas ref={paintRef} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
                <p className="sr-only">{tBiomech(locale, "biomech.viewport")}</p>
              </div>
              <canvas ref={sendRef} className="hidden" />

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    const video = videoRef.current;
                    if (!video) return;
                    if (video.paused) {
                      void video.play();
                      setPaused(false);
                      startLoop();
                    } else {
                      video.pause();
                      setPaused(true);
                      cancelAnimationFrame(loopRef.current);
                    }
                  }}
                >
                  {paused ? tBiomech(locale, "biomech.play") : tBiomech(locale, "biomech.pause")}
                </Button>
                <Button variant="outline" onClick={sample}>
                  {tBiomech(locale, "biomech.sample")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    pendingRef.current = false;
                    setSamples([]);
                  }}
                >
                  {tBiomech(locale, "biomech.clear")}
                </Button>
                <label className="flex min-h-11 items-center gap-2 text-sm text-brand-navy">
                  {tBiomech(locale, "biomech.speed.label")}
                  <select
                    className="min-h-11 rounded-control border border-brand-navy/30 bg-transparent px-2"
                    value={speed}
                    onChange={(event) => {
                      setSpeed(event.target.value);
                      if (videoRef.current) videoRef.current.playbackRate = Number(event.target.value);
                    }}
                  >
                    {SPEEDS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {tBiomech(locale, item.key)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-3 grid gap-2">
                <div className="flex flex-wrap gap-2" role="group" aria-label={tBiomech(locale, "biomech.support")}>
                  {SUPPORT.map((item) => (
                    <Button
                      key={item.value}
                      variant={supportMode === item.value ? "brand" : "outline"}
                      onClick={() => {
                        modeRef.current = item.value;
                        setSupportMode(item.value);
                      }}
                    >
                      {tBiomech(locale, item.key)}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-brand-navy/70">{tBiomech(locale, "biomech.support.logic")}</p>
              </div>

              <label className="mt-3 flex items-center gap-3 text-xs text-brand-navy">
                <span>{clock}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={0.1}
                  className="min-h-11 flex-1"
                  onChange={(event) => {
                    const video = videoRef.current;
                    if (!video || !Number.isFinite(video.duration)) return;
                    video.currentTime = (Number(event.target.value) / 100) * video.duration;
                  }}
                />
                <span>{duration}</span>
              </label>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label={tBiomech(locale, "biomech.metric.lean")} value={live.leanDisplay} hint={tBiomech(locale, "biomech.metric.leanHint")} />
                <Metric label={tBiomech(locale, "biomech.metric.knee")} value={live.kneeDisplay} hint={tBiomech(locale, "biomech.metric.kneeHint")} />
                <Metric label={tBiomech(locale, "biomech.metric.pelvis")} value={live.pelvisDisplay} hint={tBiomech(locale, "biomech.metric.pelvisHint")} />
                <Metric label={tBiomech(locale, "biomech.metric.recovery")} value={live.recoveryDisplay} hint={tBiomech(locale, "biomech.metric.recoveryHint")} />
              </div>

              <div className="mt-4 grid gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-brand-navy">{tBiomech(locale, "biomech.keyframes")}</h3>
                  <span className="text-xs text-brand-navy/70">
                    {tBiomech(locale, "biomech.keyframes.count", { count: samples.length })}
                  </span>
                </div>
                <p className="text-sm text-brand-navy/80">
                  {samples.length === 0
                    ? tBiomech(locale, "biomech.keyframes.empty")
                    : aggregate.readable > 0
                      ? tBiomech(locale, "biomech.keyframes.summary", {
                          readable: aggregate.readable,
                          unreadable: aggregate.unreadable,
                          knee: aggregate.avgKnee ?? 0,
                          lean: aggregate.avgLean ?? 0,
                          highKnee: aggregate.highKnee,
                          highLean: aggregate.highLean,
                        })
                      : tBiomech(locale, "biomech.keyframes.noneReadable", { count: samples.length })}
                </p>
                <ul className="grid gap-2">
                  {samples.map((sampleRow, index) => (
                    <li key={`${sampleRow.timeSeconds}-${index}`} className="rounded-control border border-brand-navy/15 p-3 text-sm text-brand-navy">
                      <span>
                        #{index + 1} {clockOf(sampleRow)}
                      </span>
                      {sampleRow.readable ? (
                        <span>
                          {" "}
                          {tBiomech(locale, "biomech.keyframes.row", {
                            lean: sampleRow.leanAngle ?? 0,
                            knee: sampleRow.kneeAngle ?? 0,
                          })}
                        </span>
                      ) : (
                        <span> {tBiomech(locale, "biomech.keyframes.unreadable")} {tBiomech(locale, reasonKey(sampleRow.unreadableReason))}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              <p className="mt-4 text-sm text-brand-navy">
                {feedback === "biomech.feedback.manual"
                  ? tBiomech(locale, feedback, { side: tBiomech(locale, feedbackSide) })
                  : tBiomech(locale, feedback)}
              </p>
              <Button disabled={samples.length === 0 || saving} onClick={() => void save()}>
                {tBiomech(locale, "biomech.action.save")}
              </Button>
              {status ? <p className="text-sm text-brand-navy">{tBiomech(locale, status)}</p> : null}
              {locked ? <p className="sr-only">{tBiomech(locale, "biomech.lock")}</p> : null}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-control border border-brand-navy/15 p-3">
      <p className="text-xs text-brand-navy/70">{label}</p>
      <p className="text-2xl font-semibold text-brand-navy">{value}</p>
      <p className="text-xs text-brand-navy/60">{hint}</p>
    </div>
  );
}
