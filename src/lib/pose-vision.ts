/** Pose checks for guided capture + lazy MediaPipe Pose Landmarker loading. */

import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { Capacitor } from "@capacitor/core";
import type { PoseStrain, PoseView } from "./pose";

export interface PosePoint {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export type PoseProblem =
  | "no-person"
  | "partial"
  | "offscreen"
  | "too-small"
  | "too-close"
  | "off-center"
  | "wrong-view"
  | "arms-low";

export interface PoseCheck {
  ok: boolean;
  problems: PoseProblem[];
  /** Horizontal center of the body, 0..1. */
  centerX: number;
  /** Visible body height relative to the frame, 0..1. */
  bodyHeight: number;
}

export const POSE_MESSAGES: Record<PoseProblem, string> = {
  "no-person": "Встань в кадр — я тебя не вижу",
  partial: "Покажись целиком: голова и стопы должны быть видны",
  offscreen: "Отойди чуть назад — ты не помещаешься в кадр",
  "too-small": "Подойди ближе к камере",
  "too-close": "Отойди на шаг назад",
  "off-center": "Встань по центру кадра",
  "wrong-view": "Повернись нужным боком — проверь ракурс",
  "arms-low": "Согни руки и напряги мышцы",
};

const NOSE = 0;
const L_SHOULDER = 11;
const R_SHOULDER = 12;
const L_WRIST = 15;
const R_WRIST = 16;
const L_HIP = 23;
const R_HIP = 24;
const L_ANKLE = 27;
const R_ANKLE = 28;

const KEY_POINTS = [NOSE, L_SHOULDER, R_SHOULDER, L_HIP, R_HIP, L_ANKLE, R_ANKLE];
const VISIBLE = 0.5;

const visible = (p: PosePoint | undefined) => !!p && (p.visibility ?? 1) >= VISIBLE;

/** Body framing + pose-specific checks on normalized landmarks. */
export function analyzePose(
  points: PosePoint[] | null | undefined,
  view: PoseView,
  strain: PoseStrain,
): PoseCheck {
  const empty: PoseCheck = { ok: false, problems: ["no-person"], centerX: 0.5, bodyHeight: 0 };
  if (!points || points.length < 29) return empty;
  const key = KEY_POINTS.map((i) => points[i]);
  if (!key.every(visible)) return { ...empty, problems: ["partial"] };

  const nose = points[NOSE]!;
  const lS = points[L_SHOULDER]!;
  const rS = points[R_SHOULDER]!;
  const lH = points[L_HIP]!;
  const rH = points[R_HIP]!;
  const lA = points[L_ANKLE]!;
  const rA = points[R_ANKLE]!;

  const body = [nose, lS, rS, lH, rH, lA, rA];
  const minX = Math.min(...body.map((p) => p.x));
  const maxX = Math.max(...body.map((p) => p.x));
  const top = Math.min(nose.y, lS.y, rS.y);
  const bottom = Math.max(lA.y, rA.y);
  const bodyHeight = bottom - top;
  const centerX = (minX + maxX) / 2;
  const problems: PoseProblem[] = [];

  if (top < 0.05 || bottom > 0.95 || minX < 0.03 || maxX > 0.97) {
    problems.push("offscreen");
  } else if (bodyHeight < 0.55) {
    problems.push("too-small");
  } else if (bodyHeight > 0.9) {
    problems.push("too-close");
  }
  if (Math.abs(centerX - 0.5) > 0.09) problems.push("off-center");

  const shoulderSpan = Math.abs(lS.x - rS.x) / Math.max(0.01, bodyHeight);
  if (view === "side" ? shoulderSpan > 0.15 : shoulderSpan < 0.13) {
    problems.push("wrong-view");
  }

  if (strain === "flexed") {
    const lW = points[L_WRIST];
    const rW = points[R_WRIST];
    if (!visible(lW) || !visible(rW) || (lW!.y + rW!.y) / 2 > (lH.y + rH.y) / 2 - 0.02) {
      problems.push("arms-low");
    }
  }

  return { ok: problems.length === 0, problems, centerX, bodyHeight };
}

/** Tracks landmark jitter: returns how long (ms) the pose has been still. */
export class StabilityTracker {
  private prev: PosePoint[] | null = null;
  private since: number | null = null;
  /** Normalized per-joint movement below this counts as still. */
  constructor(private readonly eps = 0.008) {}

  reset() {
    this.prev = null;
    this.since = null;
  }

  update(points: PosePoint[], now: number): number {
    if (!this.prev) {
      this.prev = points;
      this.since = now;
      return 0;
    }
    let sum = 0;
    let n = 0;
    for (let i = 0; i < Math.min(this.prev.length, points.length); i++) {
      const a = this.prev[i];
      const b = points[i];
      if (!a || !b) continue;
      sum += Math.hypot(a.x - b.x, a.y - b.y);
      n++;
    }
    if (n === 0 || sum / n > this.eps) this.since = now;
    this.prev = points;
    return this.since == null ? 0 : now - this.since;
  }
}

let landmarkerPromise: Promise<PoseLandmarker> | null = null;

async function createLandmarker(delegate: "GPU" | "CPU"): Promise<PoseLandmarker> {
  const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
  const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "/mediapipe/pose_landmarker_lite.task",
      delegate,
    },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

/** Loads the pose model once; falls back from GPU to CPU. */
export function loadPoseLandmarker(): Promise<PoseLandmarker> {
  landmarkerPromise ??= (
    Capacitor.isNativePlatform()
      ? createLandmarker("CPU")
      : createLandmarker("GPU").catch((error: unknown) => {
          console.warn("MediaPipe GPU delegate failed; retrying with CPU.", error);
          return createLandmarker("CPU");
        })
  ).catch((e: unknown) => {
    landmarkerPromise = null;
    throw e;
  });
  return landmarkerPromise;
}

export function detectPose(
  landmarker: PoseLandmarker,
  video: HTMLVideoElement | HTMLCanvasElement,
  timestamp: number,
): PosePoint[] | null {
  const result = landmarker.detectForVideo(video, timestamp);
  return (result.landmarks?.[0] as PosePoint[] | undefined) ?? null;
}
