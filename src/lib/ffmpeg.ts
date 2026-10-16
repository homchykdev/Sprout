import { ffmpegConvert, ffmpegRegister } from "./ffmpeg.functions";
import { VIDEO_MAX_BYTES, VIDEO_MAX_SEC } from "./video-rules";

export { VIDEO_MAX_BYTES, VIDEO_MAX_SEC };

/** Reads duration/size without uploading. Never hangs: rejects after 8s. */
export function probeVideo(
  file: Blob,
  timeoutMs = 8000,
): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      fn();
    };
    const timer = window.setTimeout(
      () => finish(() => rej(new Error("Не удалось прочитать видео"))),
      timeoutMs,
    );
    v.onloadedmetadata = () =>
      finish(() =>
        res({
          duration: Number.isFinite(v.duration) ? v.duration : 0,
          width: v.videoWidth,
          height: v.videoHeight,
        }),
      );
    v.onerror = () => finish(() => rej(new Error("Не удалось прочитать видео — файл повреждён?")));
    v.src = url;
  });
}

/**
 * Parses a raw ffmpeg options string into an argv array.
 * Respects single/double quotes, so `-vf "scale=1080:1920,fps=60"`
 * becomes ["-vf", "scale=1080:1920,fps=60"]. Never throws: bad quotes
 * just split on whitespace as a last resort.
 */
export function parseFfmpegCmd(cmd: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  for (const ch of cmd.trim()) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Joins an argv array back into an editable command string. */
export function joinFfmpegCmd(opts: string[]): string {
  return opts.map((o) => (/[\s"']/.test(o) ? `"${o.replace(/"/g, '\\"')}"` : o)).join(" ");
}

/** True when the options need an NVIDIA GPU (any *_nvenc encoder). */
export function isNvencOptions(opts: string[]): boolean {
  return opts.some((o) => /_nvenc$/i.test(o));
}

const dropValueFlags = new Set(["-rc", "-tune", "-spatial-aq", "-spatial_aq", "-cq", "-preset"]);

/**
 * CPU fallback for NVIDIA-only options: ffmpeg-api.com documents no GPU
 * (all guides use libx264/crf/preset), so `av1_nvenc -rc vbr -cq 38
 * -preset p7 -tune hq -spatial-aq 1` would fail with a 500. Maps to
 * `libsvtav1 -crf <cq> -preset 6`, dropping NVENC-only flags.
 * Unknown encoders pass through untouched.
 */
export function cpuFallbackOptions(opts: string[]): string[] {
  const out: string[] = [];
  let cqp = "38";
  for (let i = 0; i < opts.length; i++) {
    const o = opts[i]!;
    if (/^av1_nvenc$/i.test(o)) {
      out.push("libsvtav1");
      continue;
    }
    if (/^hevc_nvenc$/i.test(o)) {
      out.push("libx265");
      continue;
    }
    if (/^h264_nvenc$/i.test(o)) {
      out.push("libx264");
      continue;
    }
    if (/^-cq$/i.test(o)) {
      cqp = opts[i + 1] ?? cqp;
      out.push("-crf", cqp);
      i++;
      continue;
    }
    if (dropValueFlags.has(o.toLowerCase())) {
      // -preset p7 (NVENC) -> SVT-AV1 balanced preset 6; others just drop.
      if (/^-preset$/i.test(o)) {
        out.push("-preset", "6");
      }
      i++; // skip the flag's value
      continue;
    }
    out.push(o);
  }
  // NVENC -b:v 0 means "no bitrate cap" (CQ mode); libsvtav1 reads the same.
  return out;
}

export type FfmpegScale = "original" | "480p" | "720p" | "1080p";
export type FfmpegCodec = "av1-nvenc" | "av1-cpu" | "h264-cpu";

const SCALE_VF: Record<Exclude<FfmpegScale, "original">, string> = {
  "480p": "scale=480:854",
  "720p": "scale=720:1280",
  "1080p": "scale=1080:1920",
};

/** Builds an argv array from the simple-mode fields in Settings. */
export function buildFfmpegOptions(scale: FfmpegScale, fps: number, codec: FfmpegCodec): string[] {
  const vf = scale === "original" ? `fps=${fps}` : `${SCALE_VF[scale]},fps=${fps}`;
  const base = ["-vf", vf];
  if (codec === "av1-nvenc")
    return [
      ...base,
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
  if (codec === "av1-cpu")
    return [
      ...base,
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
  return [...base, "-c:v", "libx264", "-crf", "23", "-preset", "medium", "-pix_fmt", "yuv420p"];
}

const MIME_BY_EXT: Record<string, string> = {
  webm: "video/webm",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webp: "image/webp",
  gif: "image/gif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

/** Sanitizes the output container; falls back to webm. */
export function normalizeOutExt(ext: string): string {
  const e = ext.trim().toLowerCase().replace(/^\./, "");
  return MIME_BY_EXT[e] ? e : "webm";
}

export function mimeForOut(ext: string): string {
  return MIME_BY_EXT[normalizeOutExt(ext)]!;
}

export function kindForOut(ext: string): "image" | "video" {
  return mimeForOut(ext).startsWith("image/") ? "image" : "video";
}

export interface ConvertedVideo {
  blob: Blob;
  mime: string;
  kind: "image" | "video";
}

/**
 * Cloud-converts a short video via the user's own ffmpeg-api.com key.
 * Key travels only in transit through our server function — like other keys.
 * Tries the user's options as-is (NVIDIA if set); when they need NVENC and
 * the cloud answers with an error, retries once with the CPU fallback.
 */
export async function convertVideo(
  file: Blob,
  apiKey: string,
  options: string[],
  outExt: string,
): Promise<ConvertedVideo> {
  const ext = normalizeOutExt(outExt);
  const safe = `clip-${Math.random().toString(36).slice(2, 10)}.mp4`;
  const reg = await ffmpegRegister({ data: { apiKey, fileName: safe } });
  const put = await fetch(reg.uploadUrl, {
    method: "PUT",
    body: file,
    headers: reg.uploadHeaders,
  });
  if (!put.ok) throw new Error("Не удалось загрузить видео в облако для конвертации.");
  const run = async (opts: string[]) => {
    const outName = `clip-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const { downloadUrl } = await ffmpegConvert({
      data: { apiKey, filePath: reg.filePath, outName, options: opts },
    });
    const dl = await fetch(downloadUrl);
    if (!dl.ok) throw new Error("Конвертация прошла, но скачать результат не вышло.");
    const blob = await dl.blob();
    if (!blob.size) throw new Error("Облако вернуло пустой файл.");
    const mime = mimeForOut(ext);
    return { blob: new Blob([blob], { type: mime }), mime, kind: kindForOut(ext) };
  };
  try {
    return await run(options);
  } catch (e) {
    // No documented GPU on the cloud side — retry NVIDIA jobs on CPU once.
    if (isNvencOptions(options)) {
      const fb = cpuFallbackOptions(options);
      // Fallback identical to input means nothing to retry with.
      if (joinFfmpegCmd(fb) !== joinFfmpegCmd(options)) return await run(fb);
    }
    throw e;
  }
}
