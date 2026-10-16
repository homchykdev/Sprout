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
 * Cloud-converts a short video to a lightweight animated webp
 * (480px, 10 fps, q70) via the user's own ffmpeg-api.com key.
 * Key travels only in transit through our server function — like other keys.
 */
export async function convertVideoToWebp(file: Blob, apiKey: string): Promise<Blob> {
  const safe = `clip-${Math.random().toString(36).slice(2, 10)}.mp4`;
  const reg = await ffmpegRegister({ data: { apiKey, fileName: safe } });
  const put = await fetch(reg.uploadUrl, {
    method: "PUT",
    body: file,
    headers: reg.uploadHeaders,
  });
  if (!put.ok) throw new Error("Не удалось загрузить видео в облако для конвертации.");
  const outName = `clip-${Math.random().toString(36).slice(2, 10)}.webp`;
  const { downloadUrl } = await ffmpegConvert({
    data: {
      apiKey,
      filePath: reg.filePath,
      outName,
      options: [
        "-vf",
        "scale=480:-1,fps=10",
        "-c:v",
        "libwebp",
        "-lossless",
        "0",
        "-q:v",
        "70",
        "-compression_level",
        "4",
        "-loop",
        "0",
        "-an",
      ],
    },
  });
  const dl = await fetch(downloadUrl);
  if (!dl.ok) throw new Error("Конвертация прошла, но скачать результат не вышло.");
  const blob = await dl.blob();
  if (!blob.size) throw new Error("Облако вернуло пустой файл.");
  return new Blob([blob], { type: "image/webp" });
}
