/** Site-agnostic article import: HTML → clean text with numbered media markers. */
import { parse, HTMLElement as ParsedElement } from "node-html-parser";
import { z } from "zod";
import { parseLink } from "./embed";
import { MUSCLES } from "./types";

export type MediaKind = "youtube" | "vimeo" | "kinescope" | "image" | "video" | "iframe";
export interface MediaRef {
  url: string;
  kind: MediaKind;
}
export interface CleanArticle {
  /** Plain text in document order; media replaced by `[[media-N]]` markers (1-based). */
  text: string;
  media: MediaRef[];
}

const SKIP_TAGS =
  "script,style,noscript,template,nav,header,footer,aside,form,button,input,select,option,svg,canvas,audio,map,object,embed";
const HEADING = /^h[1-6]$/i;

function isHidden(el: ParsedElement): boolean {
  const style = (el.getAttribute("style") ?? "").toLowerCase().replace(/\s+/g, "");
  if (/display:none|visibility:hidden/.test(style)) return true;
  return el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true";
}

function classifyMedia(url: string): MediaKind {
  const k = parseLink(url);
  if (!k || k.type === "iframe")
    return /kinescope\.io\/(?:embed\/)?[\w-]+$/i.test(url) ? "kinescope" : "iframe";
  if (k.type === "youtube") return "youtube";
  if (k.type === "vimeo") return "vimeo";
  if (k.type === "video") return "video";
  return "image";
}

/** Media source from a <video> element itself or its first <source> child. */
function videoSrc(el: ParsedElement): string {
  return el.getAttribute("src") ?? el.querySelector("source")?.getAttribute("src") ?? "";
}

/**
 * Lazy video placeholders (e.g. a span replaced by the site's JS with a real
 * player only on scroll) keep the target in data-href / data-src attributes.
 * They count as media only when the URL clearly points to a video provider or
 * file — this avoids articles' share buttons (they also use data-href).
 */
const LAZY_VIDEO_HINT = /youtu|vimeo|kinescope|rutube|vkvideo|video|player|\.(?:mp4|webm|mov|m4v)/i;
const LAZY_IMAGE_HINT = /\.(?:jpe?g|png|gif|webp|avif)$/i;

function lazyMediaAttr(el: ParsedElement): string | "" {
  const href = el.getAttribute("data-href") ?? "";
  if (href) {
    try {
      if (LAZY_VIDEO_HINT.test(new URL(href, "https://x.invalid").href)) return href;
    } catch {
      /* ignore */
    }
  }
  const src = el.getAttribute("data-src") ?? "";
  if (src && !/^data:/i.test(src)) {
    try {
      const u = new URL(src, "https://x.invalid");
      if (LAZY_IMAGE_HINT.test(u.pathname) || LAZY_VIDEO_HINT.test(u.href)) return src;
    } catch {
      /* ignore */
    }
  }
  return "";
}

function oneLine(s: string): string {
  return s
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim();
}

/**
 * Strips boilerplate and walks the rest in document order. Every media element
 * becomes an inline marker so the AI can associate media with exercises, and the
 * media list is resolved back by number in code — the model never invents URLs.
 */
export function cleanArticleText(
  html: string,
  baseUrl: string,
  maxText = 12000,
  maxMedia = 80,
): CleanArticle {
  const root = parse(html);
  root.querySelectorAll(SKIP_TAGS).forEach((el) => el.remove());
  root.querySelectorAll("*").forEach((el) => {
    if (isHidden(el)) el.remove();
  });

  const media: MediaRef[] = [];
  const byUrl = new Map<string, number>();
  const abs = (src: string) => {
    try {
      const u = new URL(src, baseUrl);
      return /^https?:$/.test(u.protocol) ? u.href : "";
    } catch {
      return "";
    }
  };
  /** Icons/logos, pixel counters and spacing gifs are decoration, never exercise media. */
  const JUNK_PATH = /\.(?:svg|ico)$|counter|pixel|beacon|spacer|blank\.|1x1/i;
  const junkMedia = (u: URL, width?: string | null, height?: string | null): boolean =>
    JUNK_PATH.test(u.pathname) ||
    !!(width != null && Number(width) <= 3) ||
    !!(height != null && Number(height) <= 3);
  const marker = (
    src: string,
    dumbSize?: { width?: string | null | undefined; height?: string | null | undefined },
  ): string => {
    const url = abs(src);
    if (!url) return "";
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return "";
    }
    if (junkMedia(u, dumbSize?.width, dumbSize?.height)) return "";
    const known = byUrl.get(url);
    if (known != null) return `[[media-${known}]]`;
    if (media.length >= maxMedia) return "";
    media.push({ url, kind: classifyMedia(url) });
    byUrl.set(url, media.length);
    return `[[media-${media.length}]]`;
  };

  let text = "";
  const walk = (el: ParsedElement): void => {
    for (const node of el.childNodes) {
      if (!(node instanceof ParsedElement)) {
        if (node.nodeType === 3) text += node.rawText ?? "";
        continue;
      }
      const tag = node.tagName?.toLowerCase() ?? "";
      if (isHidden(node)) continue;
      if (tag === "br") text += "\n";
      else if (tag === "img")
        text += marker(node.getAttribute("src") ?? node.getAttribute("data-src") ?? "", {
          width: node.getAttribute("width"),
          height: node.getAttribute("height"),
        });
      else if (tag === "video") text += marker(videoSrc(node));
      else if (tag === "iframe") text += marker(node.getAttribute("src") ?? "");
      else {
        // Lazy placeholder (span/div + data-href/data-src) standing in for the
        // real player/picture: emit its media marker before the block's text.
        const lazy = lazyMediaAttr(node);
        if (lazy) text += marker(lazy);
        if (HEADING.test(tag)) {
          text += "\n\n## ";
          walk(node);
          text += "\n";
        } else if (tag === "li") {
          text += "\n• ";
          walk(node);
        } else if (["p", "ul", "ol", "table", "tr", "blockquote"].includes(tag)) {
          walk(node);
          text += "\n";
        } else walk(node);
      }
    }
  };
  walk(root.querySelector("body") ?? root);

  text = oneLine(text.replace(/[\r\t]/g, " "));
  // Guard against pages with no real content (parse failures, paywalls): no
  // headings and no media means we cannot tell exercises apart at all.
  if (!/^## /m.test(text) && media.length === 0) return { text: "", media };
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  if (text.length > maxText) text = `${text.slice(0, maxText).replace(/\S*$/, "")}…`;
  return { text, media };
}

// ---------- AI response parsing (pure, unit-tested) ----------

const ArticleExJson = z.object({
  media: z.array(z.number()).max(5).default([]),
  name: z.string().min(1).max(200),
  muscles: z.array(z.string()).default([]),
  category: z.string().default(""),
  mode: z.string().default("reps"),
  reps: z.number().optional(),
  seconds: z.number().optional(),
  equipment: z.string().default(""),
  description: z.string().default(""),
  steps: z.array(z.string()).default([]),
  mistakes: z.array(z.string()).default([]),
  emoji: z.string().optional(),
});
const ArticleRespJson = z.object({ exercises: z.array(ArticleExJson).max(30).default([]) });

export type ParsedArticleEx = Omit<z.infer<typeof ArticleExJson>, "media" | "mode"> & {
  mode: "reps" | "time";
  videoUrl: string | undefined;
};

/**
 * Parses the model JSON (fences tolerated), keeps only valid media marker
 * numbers and resolves each exercise to ONE media link — a hallucinated or
 * out-of-range index is dropped, it never assigns someone else's video.
 */
export function parseArticleResponse(raw: string, media: MediaRef[]): ParsedArticleEx[] {
  let parsedModel: unknown;
  try {
    parsedModel = JSON.parse(
      raw
        .replace(/^```(?:json)?/m, "")
        .replace(/```$/m, "")
        .trim(),
    );
  } catch {
    throw new Error("Модель вернула упражнения в неверном формате. Попробуйте ещё раз.");
  }
  const parsed = ArticleRespJson.safeParse(parsedModel);
  if (!parsed.success)
    throw new Error("Модель вернула упражнения в неверном формате. Попробуйте ещё раз.");
  return parsed.data.exercises.map((e) => {
    const url = e.media.map((n) => media[n - 1]?.url).find((u): u is string => Boolean(u));
    const { media: _m, mode, ...rest } = e;
    return {
      ...rest,
      mode: mode === "time" ? ("time" as const) : ("reps" as const),
      videoUrl: url,
    };
  });
}

export const ARTICLE_SYSTEM =
  "Ты — опытный тренер. Отвечай строго валидным JSON на русском языке, кратко и по делу.";

export function articlePrompt(text: string): string {
  return [
    "Разбери текст статьи на отдельные упражнения.",
    "Внутри текста медиа (видео, картинки) обозначены маркерами [[media-N]], N — номер медиа в статье.",
    "Текст статьи:",
    "-----------------------------",
    text,
    "-----------------------------",
    'Верни JSON: {"exercises":[{"media":number[],"name":string,"muscles":string[],"category":"strength"|"cardio"|"stretch","mode":"reps"|"time","reps":number,"seconds":number,"equipment":string,"description":string,"steps":string[],"mistakes":string[],"emoji":string}]}',
    "Правила:",
    `1. muscles — ТОЛЬКО из списка: ${Object.keys(MUSCLES).join(", ")}; первая — основная.`,
    "2. Включай только тренировочные упражнения по заголовкам и описаниям. Рекламу, анатомию, советы, FAQ и прочие блоки без конкретной техники пропускай.",
    "3. media — номера маркеров, которые показывают ИМЕННО это упражнение (видео сразу после его заголовка или его фото). Общие иллюстрации статьи не указывай. Если верных маркеров нет — пустой массив. Если у упражнения есть и видео, и фото — ставь видео первым.",
    "4. mode=reps для подсчёта повторов, mode=time для удержаний/планок/кардио. Число повторов или секунд бери из статьи; если не указано — reps 12 или seconds 40.",
    "5. steps — 3–8 шагов техники на русском по описанию статьи; description — одно короткое предложение; mistakes — 2–4 частые ошибки.",
    '6. Если в статье нет упражнений, верни {"exercises":[]}.',
  ].join("\n");
}
