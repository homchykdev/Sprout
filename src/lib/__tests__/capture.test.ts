import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cameraConstraints,
  cameraFrameSize,
  cameraResolutionConstraints,
  drawCameraFrame,
  getAvailableCameras,
  motionScore,
  preferredCamera,
  shouldRotateCameraFeed,
} from "../capture";

const frame = (r: number, g: number, b: number, n = 4) => {
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = 255;
  }
  return out;
};

describe("capture", () => {
  it("requests a camera resolution that matches the current screen orientation", () => {
    const c = cameraConstraints("user").video as MediaTrackConstraints;
    expect(c.facingMode).toEqual({ exact: "user" });
    expect(c.width).toEqual({ ideal: 720 });
    expect(c.height).toEqual({ ideal: 1280 });
    expect(c.aspectRatio).toEqual({ ideal: 9 / 16 });
    expect(c.advanced?.[0]).toMatchObject({ focusMode: "continuous" });
    expect(cameraResolutionConstraints(true).resizeMode).toEqual({ ideal: "none" });
    expect(cameraConstraints("environment").video).toMatchObject({
      facingMode: { exact: "environment" },
    });
    expect(cameraConstraints("environment", "back-camera").video).toMatchObject({
      deviceId: { exact: "back-camera" },
    });
    expect(cameraConstraints("user", undefined, false).video).toMatchObject({
      width: { ideal: 1280 },
      height: { ideal: 720 },
      aspectRatio: { ideal: 16 / 9 },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("classifies available cameras from the labels exposed after permission", async () => {
    vi.stubGlobal("navigator", {
      mediaDevices: {
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: "videoinput", deviceId: "front", label: "Front camera" },
          { kind: "videoinput", deviceId: "wide", label: "Back ultra-wide 0.5x" },
          { kind: "videoinput", deviceId: "main", label: "Back camera" },
        ]),
      },
    });

    expect(await getAvailableCameras()).toEqual([
      { deviceId: "front", label: "Front camera", facing: "user", lens: "standard" },
      {
        deviceId: "wide",
        label: "Back ultra-wide 0.5x",
        facing: "environment",
        lens: "wide-angle",
      },
      { deviceId: "main", label: "Back camera", facing: "environment", lens: "standard" },
    ]);
  });

  it("prefers the standard lens for a requested camera direction", () => {
    const cameras = [
      {
        deviceId: "wide",
        label: "Back ultra-wide",
        facing: "environment" as const,
        lens: "wide-angle" as const,
      },
      {
        deviceId: "main",
        label: "Back camera",
        facing: "environment" as const,
        lens: "standard" as const,
      },
      {
        deviceId: "front",
        label: "Front camera",
        facing: "user" as const,
        lens: "standard" as const,
      },
    ];
    expect(preferredCamera(cameras, "environment")?.deviceId).toBe("main");
    expect(preferredCamera(cameras, "user")?.deviceId).toBe("front");
  });

  it("rotates the camera feed when its orientation differs from the viewport", () => {
    expect(shouldRotateCameraFeed(1920, 1440, 390, 844)).toBe(true);
    expect(shouldRotateCameraFeed(1440, 1920, 390, 844)).toBe(false);
    expect(shouldRotateCameraFeed(1920, 1440, 844, 390)).toBe(false);
    expect(shouldRotateCameraFeed(1440, 1920, 844, 390)).toBe(true);
    expect(shouldRotateCameraFeed(0, 1920, 844, 390)).toBe(false);
    expect(cameraFrameSize(1920, 1440, true)).toEqual({ width: 1440, height: 1920 });
    expect(cameraFrameSize(1440, 1920, false)).toEqual({ width: 1440, height: 1920 });
  });

  it("resets the canvas transform before drawing every camera frame", () => {
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    } as unknown as HTMLCanvasElement;
    const video = { videoWidth: 1280, videoHeight: 720 } as HTMLVideoElement;

    expect(drawCameraFrame(video, canvas, true)).toBe(true);
    expect(drawCameraFrame(video, canvas, true)).toBe(true);
    expect(canvas.width).toBe(720);
    expect(canvas.height).toBe(1280);
    expect(context.setTransform).toHaveBeenCalledTimes(4);
    expect(context.setTransform).toHaveBeenNthCalledWith(1, 1, 0, 0, 1, 0, 0);
    expect(context.setTransform).toHaveBeenNthCalledWith(2, 0, 1, -1, 0, 720, 0);
    expect(context.clearRect).toHaveBeenCalledTimes(2);
    expect(context.drawImage).toHaveBeenNthCalledWith(1, video, 0, 0, 1280, 720);
  });

  it("keeps rotated selfie frames upright and mirrors them within the portrait canvas", () => {
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    } as unknown as HTMLCanvasElement;
    const video = { videoWidth: 1280, videoHeight: 720 } as HTMLVideoElement;

    expect(drawCameraFrame(video, canvas, true, true)).toBe(true);
    expect(context.setTransform).toHaveBeenLastCalledWith(0, 1, 1, 0, 0, 0);
    expect(context.drawImage).toHaveBeenLastCalledWith(video, 0, 0, 1280, 720);
    expect(canvas.width).toBe(720);
    expect(canvas.height).toBe(1280);

    expect(drawCameraFrame(video, canvas, false, true)).toBe(true);
    expect(context.setTransform).toHaveBeenLastCalledWith(-1, 0, 0, 1, 1280, 0);
  });

  it("scores identical frames as zero motion and changes as movement", () => {
    const a = frame(10, 20, 30);
    expect(motionScore(a, a)).toBe(0);
    expect(motionScore(a, frame(200, 20, 30))).toBeGreaterThan(0.2);
  });

  it("treats mismatched buffers as full motion", () => {
    expect(motionScore(new Uint8ClampedArray(8), new Uint8ClampedArray(16))).toBe(1);
    expect(motionScore(new Uint8ClampedArray(0), new Uint8ClampedArray(0))).toBe(1);
  });
});
