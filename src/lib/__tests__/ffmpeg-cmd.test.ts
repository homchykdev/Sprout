import { describe, expect, it } from "vitest";
import {
  buildFfmpegOptions,
  cpuFallbackOptions,
  isNvencOptions,
  joinFfmpegCmd,
  kindForOut,
  mimeForOut,
  normalizeOutExt,
  parseFfmpegCmd,
} from "../ffmpeg";
import { migrateState } from "../store";
import { DEFAULT_FFMPEG_OPTIONS } from "../video-rules";

describe("parse/join ffmpeg command", () => {
  it("respects quoted values", () => {
    expect(parseFfmpegCmd('-vf "scale=1080:1920,fps=60" -c:v libsvtav1')).toEqual([
      "-vf",
      "scale=1080:1920,fps=60",
      "-c:v",
      "libsvtav1",
    ]);
  });
  it("round-trips the default command", () => {
    const cmd = joinFfmpegCmd(DEFAULT_FFMPEG_OPTIONS);
    expect(parseFfmpegCmd(cmd)).toEqual(DEFAULT_FFMPEG_OPTIONS);
  });
  it("empty input parses to nothing", () => {
    expect(parseFfmpegCmd("   ")).toEqual([]);
  });
});

describe("nvenc detection + CPU fallback", () => {
  it("spots NVIDIA encoders", () => {
    expect(isNvencOptions(["-c:v", "av1_nvenc"])).toBe(true);
    expect(isNvencOptions(DEFAULT_FFMPEG_OPTIONS)).toBe(false);
    expect(isNvencOptions(["-c:v", "libx264"])).toBe(false);
  });
  it("maps av1_nvenc to libsvtav1 keeping quality", () => {
    const nvenc = buildFfmpegOptions("1080p", 60, "av1-nvenc");
    const fb = cpuFallbackOptions(nvenc);
    expect(fb).toContain("libsvtav1");
    expect(fb).not.toContain("av1_nvenc");
    // -cq 38 becomes -crf 38; NVENC-only flags are dropped.
    expect(fb).toEqual(expect.arrayContaining(["-crf", "38", "-b:v", "0", "-preset", "6"]));
    expect(fb.some((o) => ["-rc", "-tune", "-spatial-aq", "-cq"].includes(o))).toBe(false);
    // Filter graph and pixel format survive.
    expect(fb).toEqual(
      expect.arrayContaining(["-vf", "scale=1080:1920,fps=60", "-pix_fmt", "yuv420p"]),
    );
  });
  it("leaves CPU options untouched", () => {
    const cpu = ["-c:v", "libx264", "-crf", "23"];
    expect(cpuFallbackOptions(cpu)).toEqual(cpu);
    expect(isNvencOptions(cpu)).toBe(false);
  });
});

describe("preset builder", () => {
  it("builds the requested default (1080p/60/av1-cpu)", () => {
    expect(buildFfmpegOptions("1080p", 60, "av1-cpu")).toEqual(DEFAULT_FFMPEG_OPTIONS);
  });
  it("builds a CPU preset without NVIDIA flags", () => {
    const o = buildFfmpegOptions("720p", 30, "av1-cpu");
    expect(o).toEqual(
      expect.arrayContaining(["-vf", "scale=720:1280,fps=30", "-c:v", "libsvtav1"]),
    );
    expect(isNvencOptions(o)).toBe(false);
  });
});

describe("output container", () => {
  it("maps webm/mp4 to video mime", () => {
    expect(mimeForOut("webm")).toBe("video/webm");
    expect(kindForOut("webm")).toBe("video");
    expect(mimeForOut("mp4")).toBe("video/mp4");
  });
  it("sanitizes unknown containers to webm", () => {
    expect(normalizeOutExt("exe")).toBe("webm");
    expect(normalizeOutExt(".MP4")).toBe("mp4");
  });
});

describe("store migration v6", () => {
  it("fills ffmpegOptions/ffmpegOut with defaults", () => {
    const m = migrateState({}, 5);
    expect(m.ffmpegOptions).toEqual(DEFAULT_FFMPEG_OPTIONS);
    expect(m.ffmpegOut).toBe("webm");
  });
  it("keeps user values", () => {
    const m = migrateState({ ffmpegOptions: ["-c:v", "libx264"], ffmpegOut: "mp4" }, 5);
    expect(m.ffmpegOptions).toEqual(["-c:v", "libx264"]);
    expect(m.ffmpegOut).toBe("mp4");
  });
});
