/**
 * On-device video transcoding via mediabunny (WebCodecs). The library is
 * lazy-imported like heic2any — it is only fetched when a conversion runs.
 * Quality policy (user-fixed): keep the pixel resolution, re-encode with a
 * better codec at a variable-bitrate target; fps drops to 30 only after the
 * user confirmed it in Settings. Cloud (ffmpeg-api.com) stays the fallback.
 */
import type { ConvertedVideo } from "./ffmpeg";
import {
  containerForCodec,
  deviceCodecList,
  targetVideoBitrate,
  worthTranscoding,
  type BitrateLevel,
  type DeviceCodec,
  type DeviceFps,
} from "./video-rules";

/** WebCodecs encoder present (mediabunny needs it to re-encode). */
export function webCodecsAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as { VideoEncoder?: unknown }).VideoEncoder === "function"
  );
}

/** Device transcode settings as stored in the app state. */
export interface DeviceOpts {
  codec: DeviceCodec;
  bitrate: BitrateLevel;
  fps: DeviceFps;
}

const MIME_BY_CONTAINER = { mp4: "video/mp4", webm: "video/webm" } as const;

/**
 * Re-encodes a short video on the device. Resolves `null` when re-encoding
 * would not shrink the file meaningfully (the source is already efficient) —
 * callers should store the original. Throws when no codec can encode here.
 */
export async function convertVideoLocal(
  file: Blob,
  opts: DeviceOpts,
  onProgress?: (p: number) => void,
): Promise<ConvertedVideo | null> {
  const mb = await import("mediabunny");
  const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(file) });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error("В файле нет видеодорожки.");

  // ~50 packets give a fast, exact-enough bitrate estimate without a full scan.
  const stats = await track.computePacketStats(50);
  const metrics = await track.computeFrameRateMetrics().catch(() => null);
  const srcFps = Math.round(metrics?.bestGuessFrameRate ?? stats.averagePacketRate ?? 0);
  const [width, height] = await Promise.all([track.getCodedWidth(), track.getCodedHeight()]);
  const srcBitrate = stats.averageBitrate;
  if (!Number.isFinite(srcBitrate) || srcBitrate <= 0) return null;
  const target = targetVideoBitrate(srcBitrate, width, height, Math.max(srcFps, 30), opts.bitrate);
  if (!worthTranscoding(srcBitrate, target)) return null;

  for (const codec of deviceCodecList(opts.codec)) {
    const container = containerForCodec(codec);
    const encodable = await mb
      .getFirstEncodableVideoCodec([codec], {
        width,
        height,
        quality: new mb.Quality({ bitrate: target }),
      })
      .catch(() => null);
    if (encodable !== codec) continue;
    const format =
      container === "webm"
        ? new mb.WebMOutputFormat()
        : new mb.Mp4OutputFormat({ fastStart: "in-memory" });
    const output = new mb.Output({ format, target: new mb.BufferTarget() });
    try {
      const conversion = await mb.Conversion.init({
        input,
        output,
        video: {
          codec,
          quality: new mb.Quality({ bitrate: target }),
          // fps drops to 30 only after the user confirmed it; a cap never
          // touches 24/25/30 fps sources (frameRate would retime them).
          ...(opts.fps === "30" && (srcFps === 0 || srcFps > 30) ? { frameRate: 30 } : {}),
          hardwareAcceleration: "prefer-hardware",
        },
      });
      if (!conversion.isValid) continue;
      conversion.onProgress = (p) => onProgress?.(p);
      await conversion.execute();
      const buf = output.target.buffer;
      if (!buf || !buf.byteLength) throw new Error("Конвертер вернул пустой файл.");
      const mime = MIME_BY_CONTAINER[container];
      return { blob: new Blob([buf], { type: mime }), mime, kind: "video" };
    } catch (e) {
      // Try the next codec; report only when every candidate fails.
      if (codec === deviceCodecList(opts.codec).at(-1)) throw e;
    }
  }
  throw new Error("Ни один кодек не поддерживает кодирование на этом устройстве.");
}
