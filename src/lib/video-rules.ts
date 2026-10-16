/** Pure rules for uploads: no DOM, no network — safe to unit-test. */

/** Short-clip guard: longer/heavier videos are rejected before upload. */
export const VIDEO_MAX_SEC = 30;
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Default cloud-transcode options (argv): 1080x1920/60fps AV1 via NVIDIA NVENC.
 * The cloud has no documented GPU (see docs/plan.md), so `cpuFallbackOptions`
 * in ffmpeg.ts retries with a CPU encoder when this fails. Editable in Settings.
 */
export const DEFAULT_FFMPEG_OPTIONS: string[] = [
  "-vf",
  "scale=1080:1920,fps=60",
  "-c:v",
  "av1_nvenc",
  "-rc",
  "vbr",
  "-cq",
  "38",
  "-b:v",
  "0",
  "-preset",
  "p7",
  "-tune",
  "hq",
  "-spatial-aq",
  "1",
  "-pix_fmt",
  "yuv420p",
];

/** Default output container for cloud-transcoded videos. */
export const DEFAULT_FFMPEG_OUT = "webm";

/**
 * HEIC/HEIF from iPhones: browsers can't decode them, so we skip
 * with a hint instead of storing an invisible file.
 */
export function isHeicFile(f: { type: string; name: string }): boolean {
  return /hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);
}
