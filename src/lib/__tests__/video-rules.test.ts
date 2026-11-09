import { describe, expect, it } from "vitest";
import {
  BITRATE_KEEP,
  containerForCodec,
  deviceCodecList,
  isHeicFile,
  pickTranscodePath,
  targetVideoBitrate,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_SEC,
  worthTranscoding,
  type TranscodeCaps,
} from "../video-rules";

describe("isHeicFile", () => {
  it("rejects HEIC/HEIF by mime or extension", () => {
    expect(isHeicFile({ type: "image/heic", name: "IMG_1.HEIC" })).toBe(true);
    expect(isHeicFile({ type: "image/heif", name: "a.heif" })).toBe(true);
    expect(isHeicFile({ type: "", name: "photo.heic" })).toBe(true);
  });
  it("accepts common browser formats", () => {
    expect(isHeicFile({ type: "image/jpeg", name: "a.jpg" })).toBe(false);
    expect(isHeicFile({ type: "image/png", name: "a.png" })).toBe(false);
    expect(isHeicFile({ type: "image/webp", name: "a.webp" })).toBe(false);
    expect(isHeicFile({ type: "video/mp4", name: "a.mp4" })).toBe(false);
  });
});

describe("short-clip limits", () => {
  it("caps at 30s / 50MB", () => {
    expect(VIDEO_MAX_SEC).toBe(30);
    expect(VIDEO_MAX_BYTES).toBe(50 * 1024 * 1024);
  });
});

const caps = (over: Partial<TranscodeCaps> = {}): TranscodeCaps => ({
  media3: false,
  webcodecs: false,
  cloud: false,
  ...over,
});

describe("pickTranscodePath", () => {
  it("off stores originals", () => {
    expect(pickTranscodePath("off", caps({ media3: true, cloud: true }))).toBe("original");
  });
  it("device prefers native Media3, then WebCodecs, then cloud fallback", () => {
    expect(pickTranscodePath("device", caps({ media3: true, webcodecs: true }))).toBe("media3");
    expect(pickTranscodePath("device", caps({ webcodecs: true, cloud: true }))).toBe("webcodecs");
    expect(pickTranscodePath("device", caps({ cloud: true }))).toBe("cloud");
    expect(pickTranscodePath("device", caps())).toBe("original");
  });
  it("cloud mode uses the key when present, otherwise originals", () => {
    expect(pickTranscodePath("cloud", caps({ media3: true, cloud: true }))).toBe("cloud");
    expect(pickTranscodePath("cloud", caps({ media3: true }))).toBe("original");
  });
});

describe("device codec list", () => {
  it("auto tries best compression first", () => {
    expect(deviceCodecList("auto")).toEqual(["av1", "hevc", "vp9", "avc"]);
  });
  it("a pinned codec is the only candidate", () => {
    expect(deviceCodecList("hevc")).toEqual(["hevc"]);
  });
  it("maps codecs to containers that can hold them", () => {
    expect(containerForCodec("vp9")).toBe("webm");
    expect(containerForCodec("av1")).toBe("mp4");
    expect(containerForCodec("hevc")).toBe("mp4");
    expect(containerForCodec("avc")).toBe("mp4");
  });
});

describe("targetVideoBitrate", () => {
  it("keeps 40% (standard) / 25% (max) of the source", () => {
    expect(BITRATE_KEEP.standard).toBe(0.4);
    expect(BITRATE_KEEP.max).toBe(0.25);
    expect(targetVideoBitrate(10_000_000, 1080, 1920, 60, "standard")).toBe(4_000_000);
    expect(targetVideoBitrate(10_000_000, 1080, 1920, 60, "max")).toBe(2_500_000);
  });
  it("never goes below the bits-per-pixel floor", () => {
    // 0.012 bpp floor for 1080x1920@30 -> ~746 kbps beats a tiny source share.
    expect(targetVideoBitrate(500_000, 1080, 1920, 30, "standard")).toBe(746_496);
  });
  it("skips re-encoding when the win is under ~10%", () => {
    expect(worthTranscoding(1_000_000, 950_000)).toBe(false);
    expect(worthTranscoding(1_000_000, 899_999)).toBe(true);
  });
});
