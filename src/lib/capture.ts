/** Camera helpers for guided progress-photo capture. */

export type CameraFacing = "user" | "environment";
export type CameraLens = "standard" | "wide-angle" | "telephoto";

export interface CameraDevice {
  deviceId: string;
  label: string;
  facing: CameraFacing | "unknown";
  lens: CameraLens;
}

function cameraFacing(label: string): CameraDevice["facing"] {
  const name = label.toLowerCase();
  if (/front|selfie|user|передн|фронт/i.test(name)) return "user";
  if (/back|rear|environment|задн|основн/i.test(name)) return "environment";
  return "unknown";
}

function cameraLens(label: string): CameraLens {
  const name = label.toLowerCase();
  if (/ultra.?wide|wide.?angle|широкоугол|0[.,][56]x/i.test(name)) return "wide-angle";
  if (/tele|zoom|[35]x/i.test(name)) return "telephoto";
  return "standard";
}

export async function getAvailableCameras(): Promise<CameraDevice[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "videoinput")
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Камера ${index + 1}`,
      facing: cameraFacing(device.label),
      lens: cameraLens(device.label),
    }));
}

export function preferredCamera(
  cameras: CameraDevice[],
  facing: CameraFacing,
): CameraDevice | undefined {
  return cameras
    .filter((camera) => camera.facing === facing)
    .sort((a, b) => Number(a.lens !== "standard") - Number(b.lens !== "standard"))[0];
}

export function cameraResolutionConstraints(isPortrait: boolean): MediaTrackConstraints {
  return {
    width: { ideal: isPortrait ? 720 : 1280 },
    height: { ideal: isPortrait ? 1280 : 720 },
  };
}

/** Front camera by default, portrait, continuous autofocus where supported. */
export function cameraConstraints(
  facing: CameraFacing = "user",
  deviceId?: string,
  isPortrait = true,
): MediaStreamConstraints {
  const video: MediaTrackConstraints = {
    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { exact: facing } }),
    ...cameraResolutionConstraints(isPortrait),
    advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
  };
  return { video, audio: false };
}

export function fallbackCameraConstraints(
  facing: CameraFacing,
  isPortrait = true,
): MediaStreamConstraints {
  return {
    video: { facingMode: { ideal: facing }, ...cameraResolutionConstraints(isPortrait) },
    audio: false,
  };
}

export function shouldRotateCameraFeed(
  videoWidth: number,
  videoHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  if (!videoWidth || !videoHeight || !viewportWidth || !viewportHeight) return false;
  return videoWidth > videoHeight !== viewportWidth > viewportHeight;
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
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
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
