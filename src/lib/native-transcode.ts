/**
 * Web wrapper for the Media3 Transformer Capacitor plugin (Android only).
 * Mirrors native-tts.ts: lazy, graceful absence when not native.
 * The plugin is called with base64 payloads (≤50 MB) — two hops through
 * the bridge, acceptable for 30 s clips.
 */
import { Capacitor } from "@capacitor/core";
import type { ConvertedVideo } from "./ffmpeg";
import type { DeviceOpts } from "./transcode";
import {
  containerForCodec,
  targetVideoBitrate,
  worthTranscoding,
  type BitrateLevel,
  type DeviceCodec,
  type DeviceFps,
} from "./video-rules";

const PLUGIN_CODEC = ["av1", "hevc", "avc"] as const;
type PluginCodec = (typeof PLUGIN_CODEC)[number];

/** True exactly on a Capacitor Android build where the plugin is registered. */
export function media3PluginAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

/**
 * Re-encodes a short video via the Media3 Transformer plugin.
 * Returns null if the source is already efficient enough; throws when
 * the plugin is missing or every encoder attempt fails.
 */
export async function convertVideoMedia3(
  file: Blob,
  opts: DeviceOpts,
  onProgress?: (p: number) => void,
): Promise<ConvertedVideo | null> {
  if (!media3PluginAvailable()) throw new Error("Media3 plugin not available");

  // Probe source bitrate first (cheap, using the same helper as transcode.ts)
  const url = URL.createObjectURL(file);
  const meta = await new Promise<{ duration: number; width: number; height: number }>((res, rej) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      res({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      rej(new Error("probe failed"));
    };
    v.src = url;
  });
  const srcBitrate = Math.round((file.size * 8) / Math.max(meta.duration, 0.001));
  const target = targetVideoBitrate(srcBitrate, meta.width, meta.height, Math.max(30, 1), opts.bitrate);
  if (!worthTranscoding(srcBitrate, target)) return null;

  // Import Capacitor Plugins registry at runtime
  const { Capacitor } = await import("@capacitor/core");
  const Plugins = (Capacitor as unknown as { Plugins: Record<string, unknown> }).Plugins;
  const Media3Transcode = Plugins["Media3Transcode"] as
    | { convert: (opts: { inputBase64: string; outName: string; height: number; fps: number; codec: string; bitrate: number }) => Promise<{ base64: string; size: number }> }
    | undefined;
  if (!Media3Transcode?.convert) throw new Error("Media3Transcode plugin not registered");

  const codecs = (opts.codec === "auto" ? [...PLUGIN_CODEC] : [opts.codec]) as PluginCodec[];
  let lastErr: Error | undefined;

  for (const codec of codecs) {
    const container = containerForCodec(codec);
    const outName = `clip-${Math.random().toString(36).slice(2, 10)}.${container}`;
    try {
      const base64 = await blobToBase64(file);
      const res = await Media3Transcode.convert({
        inputBase64: base64,
        outName,
        height: meta.height,
        fps: opts.fps === "30" && meta.duration > 0 ? 30 : 0, // 0 = keep original
        codec,
        bitrate: target,
      });
      onProgress?.(1);
      const outBytes = base64ToBytes(res.base64);
      const mime = container === "webm" ? "video/webm" : "video/mp4";
      return { blob: new Blob([outBytes.buffer as ArrayBuffer], { type: mime }), mime, kind: "video" };
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      // If HEVC/AV1 failed, we'll try the next (avc is usually available).
      if (codec !== codecs[codecs.length - 1]) continue;
    }
  }
  throw lastErr ?? new Error("Media3 transcode failed for all codecs");
}

/** Small helpers to avoid pulling in a full base64 lib. */
function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res((r.result as string).split(",")[1] ?? "");
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}