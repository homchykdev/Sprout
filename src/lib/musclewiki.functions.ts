import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const BASE = "https://api.musclewiki.com";

async function mw(path: string, apiKey: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { "X-API-Key": apiKey, ...(init?.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) {
    const msg =
      res.status === 401 || res.status === 403
        ? "Ключ MuscleWiki не принят. Проверьте ключ и тариф (нужен TESTING или выше)."
        : res.status === 429
          ? "Лимит запросов MuscleWiki исчерпан. Попробуйте позже."
          : `MuscleWiki ответил ошибкой ${res.status}`;
    throw new Error(msg);
  }
  return text ? JSON.parse(text) : null;
}

export const mwSearch = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ apiKey: z.string().min(4), q: z.string().min(2).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const r = await mw(`/search?q=${encodeURIComponent(data.q)}&limit=20`, data.apiKey);
    const list = Array.isArray(r) ? r : (r?.results ?? r?.items ?? []);
    return list.map((x: any) => ({
      id: Number(x.id),
      name: String(x.name ?? ""),
      category: String(x.category ?? ""),
      muscles: (x.primary_muscles ?? x.muscles ?? []) as string[],
      difficulty: (x.difficulty ?? null) as string | null,
    }));
  });

export const mwGet = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ apiKey: z.string().min(4), id: z.number() }).parse(d))
  .handler(async ({ data }) => {
    const x = await mw(`/exercises/${data.id}?detail=true`, data.apiKey);
    const videos = (x.videos ?? []) as { url: string | null; angle: string; gender: string }[];
    const pick = videos.find((v) => v.url && v.angle === "front" && v.gender === "male") ?? videos.find((v) => v.url);
    return {
      id: Number(x.id),
      name: String(x.name),
      category: String(x.category ?? ""),
      muscles: (x.primary_muscles ?? []) as string[],
      difficulty: (x.difficulty ?? null) as string | null,
      steps: ((x.steps ?? []) as unknown[]).map(String),
      videoUrl: pick?.url ? (pick.url.startsWith("http") ? pick.url : `${BASE}${pick.url}`) : null,
    };
  });

export const mwMediaToken = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ apiKey: z.string().min(4) }).parse(d))
  .handler(async ({ data }) => {
    const r = await mw(`/media/token`, data.apiKey, { method: "POST" });
    return { token: String(r.token), expiresIn: Number(r.expires_in ?? 600) };
  });
