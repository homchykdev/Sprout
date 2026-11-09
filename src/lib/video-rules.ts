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

// ---- On-device transcode (store v14): codec first, then bitrate, fps only on confirm ----

/** Where conversion runs. "device" is the default; cloud stays as fallback. */
export type TranscodeMode = "device" | "cloud" | "off";
/** Codec for the device path; "auto" = best-compression first (see deviceCodecList). */
export type DeviceCodec = "auto" | "av1" | "hevc" | "vp9" | "avc";
/** Bitrate cut: standard keeps ~40% of the source, max keeps ~25% (VBR, low motion). */
export type BitrateLevel = "standard" | "max";
/** Device fps: keep original ("asis", default) or drop to 30 — after explicit confirm. */
export type DeviceFps = "asis" | "30";

/** Probed at runtime in media.ts / transcode.ts / native-transcode.ts — never guessed. */
export interface TranscodeCaps {
  /** Media3 Transformer plugin registered (native Android build). */
  media3: boolean;
  /** WebCodecs VideoEncoder exists (mediabunny can encode). */
  webcodecs: boolean;
  /** Cloud key present (ffmpeg-api.com). */
  cloud: boolean;
}

export type TranscodePath = "media3" | "webcodecs" | "cloud" | "original";

/**
 * Priority chain per user decision: device first (native Media3, then WebCodecs),
 * cloud only as fallback or when explicitly chosen; "off" stores originals.
 */
export function pickTranscodePath(mode: TranscodeMode, caps: TranscodeCaps): TranscodePath {
  if (mode === "off") return "original";
  if (mode === "cloud") return caps.cloud ? "cloud" : "original";
  if (caps.media3) return "media3";
  if (caps.webcodecs) return "webcodecs";
  if (caps.cloud) return "cloud";
  return "original";
}

/** Codec candidates for the device path: user pick or auto (best compression first). */
export function deviceCodecList(codec: DeviceCodec): Exclude<DeviceCodec, "auto">[] {
  return codec === "auto" ? ["av1", "hevc", "vp9", "avc"] : [codec];
}

/** Container that actually holds the codec (webm cannot hold hevc/avc). */
export function containerForCodec(codec: Exclude<DeviceCodec, "auto">): "mp4" | "webm" {
  return codec === "vp9" ? "webm" : "mp4";
}

/** Share of the source bitrate the encoder aims for (variable bitrate). */
export const BITRATE_KEEP: Record<BitrateLevel, number> = { standard: 0.4, max: 0.25 };

/** Bits per pixel per frame below which low-motion clips visibly degrade. */
const BITRATE_BPP_FLOOR = 0.012;

/**
 * Target average VBR bitrate for a low-motion clip: keep ~40% (standard) or ~25%
 * (max) of the source, guarded by a bits-per-pixel floor for already-tiny sources.
 */
export function targetVideoBitrate(
  sourceBitrate: number,
  width: number,
  height: number,
  fps: number,
  level: BitrateLevel,
): number {
  const floor = width * height * Math.max(fps, 1) * BITRATE_BPP_FLOOR;
  return Math.max(Math.round(sourceBitrate * BITRATE_KEEP[level]), Math.round(floor));
}

/** Re-encoding is pointless (and lossy) when the win is under ~10%. */
export function worthTranscoding(sourceBitrate: number, targetBitrate: number): boolean {
  return targetBitrate < sourceBitrate * 0.9;
}
