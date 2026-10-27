/** Camera helpers for guided progress-photo capture. */

export type CameraFacing = "user" | "environment";

/** Front camera by default, portrait, continuous autofocus where supported. */
export function cameraConstraints(facing: CameraFacing = "user"): MediaStreamConstraints {
  const video: MediaTrackConstraints = {
    facingMode: { ideal: facing },
    width: { ideal: 1440 },
    height: { ideal: 1920 },
    aspectRatio: { ideal: 3 / 4 },
    advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
  };
  return { video, audio: false };
}

export function shouldRotateCameraFeed(
  videoWidth: number,
  videoHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  return videoWidth > videoHeight && viewportHeight > viewportWidth;
}

export function cameraFrameSize(
  width: number,
  height: number,
  rotate: boolean,
): { width: number; height: number } {
  return rotate ? { width: height, height: width } : { width, height };
}

export function drawCameraFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  rotate: boolean,
  mirror = false,
): boolean {
  const width = video.videoWidth;
  const height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!width || !height || !ctx) return false;

  const size = cameraFrameSize(width, height, rotate);
  if (canvas.width !== size.width) canvas.width = size.width;
  if (canvas.height !== size.height) canvas.height = size.height;
  if (rotate && mirror) {
    ctx.transform(0, 1, 1, 0, 0, 0);
  } else if (rotate) {
    ctx.translate(height, 0);
    ctx.rotate(Math.PI / 2);
  } else if (mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, width, height);
  return true;
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Mirror the preview for the front camera — and keep the same view in the shot. */
export function captureJpeg(
  video: HTMLVideoElement,
  mirror: boolean,
  rotate = false,
  quality = 0.9,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  if (!drawCameraFrame(video, canvas, rotate, mirror))
    return Promise.reject(new Error("Camera frame is unavailable."));
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("empty"))), "image/jpeg", quality);
  });
}

/** Draws a small grayscale frame into a reusable canvas and returns its pixels. */
export function sampleGray(
  video: HTMLVideoElement | HTMLCanvasElement,
  canvas: HTMLCanvasElement,
): Uint8ClampedArray | null {
  const w = 64;
  const h = 48;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || !("videoWidth" in video ? video.videoWidth : video.width)) return null;
  ctx.drawImage(video, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

/** Mean absolute pixel difference of two RGBA frames, 0..1. */
export function motionScore(prev: Uint8ClampedArray, next: Uint8ClampedArray): number {
  if (!prev.length || prev.length !== next.length) return 1;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < next.length; i += 4) {
    sum += Math.abs(next[i]! - prev[i]!) + Math.abs(next[i + 1]! - prev[i + 1]!);
    n += 2;
  }
  return n ? sum / n / 255 : 1;
}
