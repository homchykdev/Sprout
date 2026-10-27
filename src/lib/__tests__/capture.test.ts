import { describe, expect, it } from "vitest";
import {
  cameraConstraints,
  cameraFrameSize,
  motionScore,
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
  it("requests a portrait front camera with continuous focus", () => {
    const c = cameraConstraints("user").video as MediaTrackConstraints;
    expect(c.facingMode).toEqual({ ideal: "user" });
    expect(c.width).toEqual({ ideal: 1440 });
    expect(c.height).toEqual({ ideal: 1920 });
    expect(c.aspectRatio).toEqual({ ideal: 3 / 4 });
    expect(c.advanced?.[0]).toMatchObject({ focusMode: "continuous" });
    expect(cameraConstraints("environment").video).toMatchObject({
      facingMode: { ideal: "environment" },
    });
  });

  it("rotates a landscape camera feed only in a portrait viewport", () => {
    expect(shouldRotateCameraFeed(1920, 1440, 390, 844)).toBe(true);
    expect(shouldRotateCameraFeed(1440, 1920, 390, 844)).toBe(false);
    expect(shouldRotateCameraFeed(1920, 1440, 844, 390)).toBe(false);
    expect(cameraFrameSize(1920, 1440, true)).toEqual({ width: 1440, height: 1920 });
    expect(cameraFrameSize(1440, 1920, false)).toEqual({ width: 1440, height: 1920 });
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
