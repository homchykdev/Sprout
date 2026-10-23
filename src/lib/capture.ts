/** Camera helpers for guided progress-photo capture. */

export type CameraFacing = "user" | "environment";

/** Front camera by default, portrait, continuous autofocus where supported. */
export function cameraConstraints(facing: CameraFacing = "user"): MediaStreamConstraints {
  const video: MediaTrackConstraints = {
    facingMode: { ideal: facing },
    width: { ideal: 1440 },
    height: { ideal: 1920 },
    advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
  };
  return { video, audio: false };
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Mirror the preview for the front camera — and keep the same view in the shot. */
export function captureJpeg(
  video: HTMLVideoElement,
  mirror: boolean,
  quality = 0.9,
): Promise<Blob> {
  const w = video.videoWidth || 1080;
  const h = video.videoHeight || 1920;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("canvas"));
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("empty"))), "image/jpeg", quality);
  });
}

/** Draws a small grayscale frame into a reusable canvas and returns its pixels. */
export function sampleGray(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): Uint8ClampedArray | null {
  const w = 64;
  const h = 48;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || !video.videoWidth) return null;
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
