import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Thin proxy for the official YouTube Data API v3 with the user's own key
 * (stored client-side, never logged). Quota: search.list = 100 units,
 * videos.list = 1 unit, ~10 000 units/day free → ~100 searches/day.
 * Read-only: search + details + oEmbed verification, nothing is ever written.
 */

const Url = z
  .string()
  .url()
  .refine((s) => s.startsWith("https://"), "HTTPS only");

export const YoutubeSearchInput = z.object({
  apiKey: z.string().min(10).max(200),
  q: z.string().min(1).max(200),
  /** videoDuration filter: short (<4 min) or medium (4–20 min). */
  duration: z.enum(["short", "medium"]).default("short"),
});

export const YoutubeVideosInput = z.object({
  apiKey: z.string().min(10).max(200),
  /** Allowed YouTube video-id shape; the API would reject anything else anyway. */
  ids: z
    .array(z.string().regex(/^[\w-]{6,24}$/))
    .min(1)
    .max(10),
});

export const YoutubeOEmbedInput = z.object({
  /** Any watch URL we built ourselves from data — validated against YouTube hosts. */
  url: Url,
});

export interface YoutubeSearchItem {
  videoId: string;
  title: string;
  channel: string;
  live: boolean;
}

export interface YoutubeVideoDetails {
  videoId: string;
  title: string;
  channel: string;
  /** ISO-8601 parsed into seconds; 0 when unknown. */
  durationSec: number;
  embeddable: boolean;
  public: boolean;
  description: string;
}

async function ytFetch(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text();
    // 403 quotaExceeded / dailyLimitExceeded → a clean Russian error, no retry loop here.
    if (res.status === 403 && /quota/i.test(body))
      throw new Error(
        "Лимит YouTube API за сегодня исчерпан. Найденное в кэше работает, поиск должен продолжаться завтра.",
      );
    if (res.status === 400 && /API key not valid|API_KEY_INVALID/i.test(body))
      throw new Error("YouTube-ключ не принят. Проверьте его в настройках.");
    // The upstream text cannot contain the key (it travels in `key=` param, redacted):
    const keyless = body.replace(/key=[^&\s]+/g, "key=[скрыт]").slice(0, 300);
    throw new Error(`YouTube API вернул ошибку ${res.status}: ${keyless}`);
  }
  try {
    return await res.json();
  } catch {
    throw new Error("YouTube API вернул не JSON.");
  }
}

/** search.list — ordered candidates for a "proper form" query. costs 100 units. */
export const youtubeSearch = createServerFn({ method: "POST" })
  .validator((d) => YoutubeSearchInput.parse(d))
  .handler(async ({ data }) => {
    const u = new URL("https://www.googleapis.com/youtube/v3/search");
    u.searchParams.set("part", "snippet");
    u.searchParams.set("type", "video");
    u.searchParams.set("maxResults", "8");
    u.searchParams.set("videoEmbeddable", "true");
    u.searchParams.set("videoDuration", data.duration);
    u.searchParams.set("q", data.q);
    u.searchParams.set("key", data.apiKey);
    const j = await ytFetch(u.toString());
    const items = (j as { items?: unknown[] }).items ?? [];
    const out: YoutubeSearchItem[] = items.flatMap((it) => {
      const id = (it as { id?: { kind?: unknown } }).id;
      const snip = (it as { snippet?: Record<string, unknown> }).snippet as Record<string, unknown>;
      if (!id || typeof id !== "object") return [];
      const videoId = (id as { videoId?: unknown }).videoId;
      if (typeof videoId !== "string" || !/^[\w-]{6,24}$/.test(videoId)) return [];
      return [
        {
          videoId,
          title: String(snip["title"] ?? "").slice(0, 200),
          channel: String(snip["channelTitle"] ?? "").slice(0, 120),
          live: (snip["liveBroadcastContent"] ?? "none") !== "none",
        },
      ];
    });
    return { items: out };
  });

/** videos.list — duration/embeddability/privacy + description (chapters) in ONE call, 1 unit. */
export const youtubeVideos = createServerFn({ method: "POST" })
  .validator((d) => YoutubeVideosInput.parse(d))
  .handler(async ({ data }) => {
    const u = new URL("https://www.googleapis.com/youtube/v3/videos");
    u.searchParams.set("part", "snippet,status,contentDetails");
    u.searchParams.set("id", data.ids.join(","));
    u.searchParams.set("key", data.apiKey);
    const j = await ytFetch(u.toString());
    const items = (j as { items?: unknown[] }).items ?? [];
    const out = items.flatMap((it) => {
      const o = it as Record<string, unknown>;
      const videoId = o["id"] as unknown as string;
      const snip = (o["snippet"] ?? {}) as Record<string, unknown>;
      const status = (o["status"] ?? {}) as Record<string, unknown>;
      const details = (o["contentDetails"] ?? {}) as Record<string, unknown>;
      if (typeof videoId !== "string" || !/^[\w-]{6,24}$/.test(videoId)) return [];
      return [
        {
          videoId,
          title: String(snip["title"] ?? "").slice(0, 200),
          channel: String(snip["channelTitle"] ?? "").slice(0, 120),
          durationSec: parseIsoDuration(String(details["duration"] ?? "")),
          embeddable: status["embeddable"] !== false,
          public: status["privacyStatus"] === "public",
          description: String(snip["description"] ?? "").slice(0, 6000),
        } satisfies YoutubeVideoDetails,
      ];
    });
    return { items: out };
  });

/** oEmbed existence check without any API key/publicity check for pasted links. */
export const youtubeOEmbed = createServerFn({ method: "POST" })
  .validator((d) => YoutubeOEmbedInput.parse(d))
  .handler(async ({ data }) => {
    const u = new URL("https://www.youtube.com/oembed");
    u.searchParams.set("url", data.url);
    u.searchParams.set("format", "json");
    let res: Response;
    try {
      res = await fetch(u.toString(), { headers: { Accept: "application/json" } });
    } catch {
      throw new Error("Не удалось проверить ссылку (сеть недоступна?).");
    }
    if (!res.ok)
      return {
        ok: false as const,
        reason: "Видео не отвечает через oEmbed (приватное или удалённое?).",
      };
    try {
      const j = (await res.json()) as { title?: unknown; author_name?: unknown };
      return {
        ok: true as const,
        title: typeof j.title === "string" ? j.title.slice(0, 200) : "",
        channel: typeof j.author_name === "string" ? j.author_name.slice(0, 120) : "",
      };
    } catch {
      return { ok: false as const, reason: "oEmbed вернул не JSON." };
    }
  });

/** "PT4M13S" → seconds; months/years ignored (video durations never carry them). */
export function parseIsoDuration(iso: string): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso.trim());
  if (!m) return 0;
  const [, d = "0", h = "0", min = "0", s = "0"] = m;
  return Number(d) * 86_400 + Number(h) * 3_600 + Number(min) * 60 + Number(s);
}

/** Key sanity check: 1 unit for one videos.list call. */
export const youtubeKeyCheck = createServerFn({ method: "POST" })
  .validator((d) => z.object({ apiKey: z.string().min(10).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const start = Date.now();
    const u = new URL("https://www.googleapis.com/youtube/v3/videos");
    u.searchParams.set("part", "id");
    u.searchParams.set("id", "dQw4w9WgXcQ");
    u.searchParams.set("key", data.apiKey);
    await ytFetch(u.toString());
    return { ms: Date.now() - start };
  });
