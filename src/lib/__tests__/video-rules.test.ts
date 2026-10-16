import { describe, expect, it } from "vitest";
import { isHeicFile, VIDEO_MAX_BYTES, VIDEO_MAX_SEC } from "../video-rules";

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
