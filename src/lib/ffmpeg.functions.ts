import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const BASE = "https://api.ffmpeg-api.com";
const Key = z.string().min(8).max(200);

function mapError(status: number, body: string): Error {
  if (status === 401 || status === 403)
    return new Error("Ключ ffmpeg-api.com не принят. Проверьте ключ в настройках.");
  if (status === 429) return new Error("Лимит ffmpeg-api.com исчерпан. Попробуйте позже.");
  if (status === 413 || /max file size/i.test(body))
    return new Error("Файл слишком большой для тарифа ffmpeg-api.com.");
  return new Error(`ffmpeg-api.com ответил ошибкой ${status}: ${body.slice(0, 160)}`);
}

async function call(path: string, apiKey: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Basic ${apiKey}`, "Content-Type": "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw mapError(res.status, text);
  return text ? JSON.parse(text) : null;
}

/** Cheap health check: lists directories, spends no conversion quota. */
export const ffmpegPing = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ apiKey: Key }).parse(d))
  .handler(async ({ data }) => {
    const t = Date.now();
    await call("/directory", data.apiKey, { method: "GET" });
    return { ms: Date.now() - t };
  });

/** Registers a file and returns the presigned upload URL (bytes go there client-side). */
export const ffmpegRegister = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ apiKey: Key, fileName: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const r = await call("/file", data.apiKey, {
      method: "POST",
      body: JSON.stringify({ file_name: data.fileName }),
    });
    return {
      filePath: String(r.file.file_path),
      uploadUrl: String(r.upload.url),
      uploadHeaders: (r.upload.headers ?? {}) as Record<string, string>,
    };
  });

const ConvertInput = z.object({
  apiKey: Key,
  /** `dir_id/name` from ffmpegRegister. */
  filePath: z.string().min(1).max(200),
  /** Output name, e.g. `clip-abc.webp`. */
  outName: z.string().min(1).max(120),
  options: z.array(z.string().max(200)).min(1).max(32),
});

/**
 * Converts an uploaded file in the cloud (sync, for short clips).
 * Returns a direct download URL of the converted file.
 */
export const ffmpegConvert = createServerFn({ method: "POST" })
  .inputValidator((d) => ConvertInput.parse(d))
  .handler(async ({ data }) => {
    const r = await call("/ffmpeg/process", data.apiKey, {
      method: "POST",
      body: JSON.stringify({
        task: {
          inputs: [{ file_path: data.filePath }],
          outputs: [{ file: data.outName, options: data.options }],
        },
      }),
    });
    const first = r.result?.[0];
    if (!first?.download_url) throw new Error("ffmpeg-api.com не вернул файл результата.");
    return { downloadUrl: String(first.download_url), sizeBytes: Number(first.size_bytes ?? 0) };
  });
