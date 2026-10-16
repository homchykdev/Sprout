/** Pure rules for uploads: no DOM, no network — safe to unit-test. */

/** Short-clip guard: longer/heavier videos are rejected before upload. */
export const VIDEO_MAX_SEC = 30;
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Default cloud-transcode options (argv): 1080x1920/60fps AV1 on CPU.
 * Playground check confirmed no NVIDIA on ffmpeg-api.com, so NVENC is only
 * an opt-in preset (with automatic CPU retry). Editable in Settings.
 */
export const DEFAULT_FFMPEG_OPTIONS: string[] = [
  "-vf",
  "scale=1080:1920,fps=60",
  "-c:v",
  "libsvtav1",
  "-crf",
  "38",
  "-b:v",
  "0",
  "-preset",
  "6",
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
