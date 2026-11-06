import { llmBudget } from "./budget";
import { registerVideo, type VerifiedVideo } from "./refs";
import { useChat } from "./store";
import type { ToolStepSink } from "./types";
import { aiAnalyzeVideoSegment, statusOf } from "../ai.functions";
import { parseTime } from "../embed";
import { parseIsoDuration, youtubeSearch, youtubeVideos } from "../youtube.functions";
import { logWarn } from "../logger";

/**
 * Real, verified exercise-video resolution pipeline (attached plan §7).
 * The model never writes IDs or timestamps anywhere: search goes through the
 * official YouTube Data API, chapters are parsed from the description, and
 * Gemini video analysis is only a budgeted fallback. Results land in the
 * `video_ref` registry; a persistent per-exercise cache protects the quota.
 */

export const CHAPTER_MAX_SEC = 240;
export const AI_MAX_SEC = 120;
/** Top free-tier video input budget ≈ 300 tokens per second (plan §2.2, verify in docs). */
export const TOKENS_PER_VIDEO_SEC = 300;
const MAX_VIDEO = 8 * 60;
const MAX_CANDIDATES = 2;
const CACHE_TTL_DAYS = 7;

/** Lowercase, ё→е, punctuation stripped; the basis for name matching. */
export function normalizeExName(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface Candidate {
  videoId: string;
  title: string;
  channel: string;
  durationSec: number;
  public: boolean;
  embeddable: boolean;
  description: string;
}

interface CacheEntry {
  videoId: string;
  title: string;
  channel: string;
  durationSec: number;
  clip?: { start: number; end: number; source: "chapters" | "ai" | "whole" } | undefined;
  verifiedAt: string;
}

export interface FindVideoOutcome {
  status: "found" | "not_found" | "error";
  note?: string;
  video?: VerifiedVideo;
}

/* ---------------- chapters ---------------- */

const TIME_LINE =
  /(?:^|\n)\s*(?:[-•*]?\s*)?(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:-|–|—|‑|=>|:)?\s*([^\n]{1,120})/g;

/** Chapters from the description: "1:20 Squats" lines, end = next chapter start. */
export function chaptersFromDescription(description: string): { start: number; label: string }[] {
  const out: { start: number; label: string }[] = [];
  for (const m of description.matchAll(TIME_LINE)) {
    const start = parseTime(m[1]!);
    const label = (m[2] ?? "").trim().replace(/^[-–—:]\s*/, "");
    if (start == null || start > 12 * 3600 || !label) continue;
    out.push({ start, label });
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Picks the chapter that names the exercise (match by normalized substring in
 * EITHER direction), betting end on the next chapter; 2:00/2012 offsets on the
 * whole video fallback are handled by callers.
 */
export function chapterForExercise(chapters: { start: number; label: string }[], exercise: string) {
  const norm = normalizeExName(exercise);
  if (!norm) return null;
  const idx = chapters.findIndex((c) => {
    const l = normalizeExName(c.label);
    return l.includes(norm) || norm.includes(l);
  });
  if (idx === -1) return null;
  const start = chapters[idx]!.start;
  const end = chapters[idx + 1]?.start ?? start + 60;
  if (end <= start || end - start > CHAPTER_MAX_SEC) return null;
  return { start, end, source: "chapters" as const };
}

/* ---------------- cache ---------------- */

function cacheKey(exercise: string, hint?: string): string {
  return `${normalizeExName(exercise)}|${normalizeExName(hint ?? "")}`;
}

function cachedVerification(exercise: string, hint?: string): CacheEntry | null {
  const entry = useChat.getState().videoCache[cacheKey(exercise, hint)];
  if (!entry) return null;
  const ageDays = (Date.now() - Date.parse(entry.verifiedAt)) / (86_400 * 1000);
  if (!Number.isFinite(ageDays) || ageDays > CACHE_TTL_DAYS) return null;
  return entry as CacheEntry;
}

/* ---------------- pipeline ---------------- */

function scoreCandidate(c: Candidate, exercise: string, hint?: string): number {
  const t = normalizeExName(c.title);
  const ex = normalizeExName(exercise);
  const h = normalizeExName(hint ?? "");
  let score = 0;
  if (t.includes(ex) || ex.includes(t)) score += 40;
  if (h && (t.includes(h) || h.includes(t))) score += 30;
  if (c.durationSec <= 300) score += 10;
  if (c.durationSec <= 90) score += 5;
  return score;
}

function validClip(start: number, end: number, durationSec: number, source: string): boolean {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  if (start < 0 || end <= start || end > durationSec + 1) return false;
  const max = source === "chapters" ? CHAPTER_MAX_SEC : AI_MAX_SEC;
  return end - start >= 3 && end - start <= max;
}

async function analyzeWithGemini(
  candidate: Candidate,
  exercise: string,
  ctx: { keys: string[]; model: string; steps?: ToolStepSink | undefined },
): Promise<{ start: number; end: number } | null> {
  // Token estimate BEFORE sending: duration x ~300; skip when out of budget.
  const estimate = candidate.durationSec * TOKENS_PER_VIDEO_SEC;
  if (!llmBudget.tryTokens(estimate)) {
    ctx.steps?.add(`Пропускаю анализ «${candidate.title}» — дневной лимит ИИ почти исчерпан`);
    return null;
  }
  if (!llmBudget.tryRequest()) return null;
  try {
    const { clip } = await aiAnalyzeVideoSegment({
      data: {
        keys: ctx.keys,
        model: ctx.model,
        youtubeUrl: `https://www.youtube.com/watch?v=${candidate.videoId}`,
        exerciseHint: exercise,
      },
    });
    if (!clip) return null;
    return validClip(clip.start, clip.end, candidate.durationSec, "ai")
      ? { start: clip.start, end: clip.end }
      : null;
  } catch (e) {
    logWarn("llm", "Сегмент-анализ не удался", { status: statusOf(e) });
    return null;
  }
}

/**
 * find_exercise_video handler body. `keys`/`model` are the user's Gemini
 * settings for the fallback analysis; `youtubeKey` enables the official search.
 */
export async function findExerciseVideo(opts: {
  exercise: string;
  queryHint?: string | undefined;
  keys: string[];
  model: string;
  youtubeKey?: string | undefined;
  steps?: ToolStepSink | undefined;
}): Promise<FindVideoOutcome> {
  const exercise = opts.exercise.trim().slice(0, 160);
  if (!exercise) return { status: "error", note: "Пустое имя упражнения." };

  // 1. Cache — a verified result costs nothing to reuse.
  const cached = cachedVerification(exercise, opts.queryHint);
  if (cached) {
    opts.steps?.add(`Кэш: «${cached.title}»${cached.clip ? ", сегмент готов" : ""}`);
    return {
      status: "found",
      video: {
        videoId: cached.videoId,
        title: cached.title,
        channel: cached.channel,
        durationSec: cached.durationSec,
        clip: cached.clip,
        verifiedAt: cached.verifiedAt,
      },
    };
  }

  const steps = opts.steps;

  // 2. No YouTube key → degrade honestly; nothing is invented (plan §3).
  if (!opts.youtubeKey) {
    return {
      status: "not_found",
      note: "YouTube-ключ не задан — приложение не может проверить поиск. Чтобы добавить видео, вставьте ссылку в сообщение или добавьте ключ в Настройках.",
    };
  }

  const q = (opts.queryHint?.trim() || `${exercise}`).slice(0, 180);

  // 3. Official search: shorts first, then medium vídeos (100 units each).
  steps?.add(`Выполняет поиск: «${q}»…`);
  let items: { videoId: string; title: string; channel: string; live: boolean }[] = [];
  for (const duration of ["short", "medium"] as const) {
    if (!llmBudget.tryRequest()) {
      return { status: "error", note: "Слишком много запросов в минуту — попробуйте чуть позже." };
    }
    try {
      const { items: found } = await youtubeSearch({
        data: { apiKey: opts.youtubeKey, q, duration },
      });
      items = found;
      if (found.length) break;
    } catch (e) {
      return { status: "error", note: (e as Error).message.slice(0, 300) };
    }
  }
  if (!items.length) return { status: "not_found", note: "Поиск не дал выдачи." };

  // 4. Details for all candidates in ONE videos.list call.
  const ids = items
    .filter((i) => !i.live)
    .map((i) => i.videoId)
    .slice(0, 8);
  if (!ids.length) return { status: "not_found", note: "Только live-эфиры в выдаче." };
  let details: Candidate[] = [];
  if (!llmBudget.tryRequest()) {
    return { status: "error", note: "Слишком много запросов в минуту — попробуйте чуть позже." };
  }
  try {
    const { items: desc } = await youtubeVideos({ data: { apiKey: opts.youtubeKey, ids } });
    details = desc.map((d) => ({
      videoId: d.videoId,
      title: d.title,
      channel: d.channel,
      durationSec: d.durationSec,
      public: d.public,
      embeddable: d.embeddable,
      description: d.description,
    }));
  } catch (e) {
    return { status: "error", note: (e as Error).message.slice(0, 300) };
  }

  // 5. Filter + rank; top-2 go to timecode verification.
  const valid = details
    .filter((c) => c.public && c.embeddable && c.durationSec > 0 && c.durationSec <= MAX_VIDEO)
    .sort(
      (a, b) =>
        scoreCandidate(b, exercise, opts.queryHint) - scoreCandidate(a, exercise, opts.queryHint),
    )
    .slice(0, MAX_CANDIDATES);
  if (!valid.length) {
    return { status: "not_found", note: "Подходящие публичные встраиваемые видео не найдены." };
  }

  for (const c of valid) {
    // a) chapters — free and fast.
    const chapter = chapterForExercise(chaptersFromDescription(c.description), exercise);
    if (chapter) {
      const end = Math.min(chapter.end, c.durationSec);
      if (validClip(chapter.start, end, c.durationSec, "chapters")) {
        steps?.add(`Найдены таймкоды в описании: ${chapter.start}–${end} c`);
        const video: VerifiedVideo = {
          videoId: c.videoId,
          title: c.title,
          channel: c.channel,
          durationSec: c.durationSec,
          clip: { start: chapter.start, end, source: "chapters" },
          verifiedAt: new Date().toISOString(),
        };
        useChat.getState().setVideoCacheEntry(cacheKey(exercise, opts.queryHint), { ...video });
        return { status: "found", video };
      }
    }
    // b) short whole video whose title clearly matches.
    if (c.durationSec <= 90 && scoreCandidate(c, exercise, opts.queryHint) >= 40) {
      steps?.add(`Видео короткое (${c.durationSec} c) — берём целиком`);
      const video: VerifiedVideo = {
        videoId: c.videoId,
        title: c.title,
        channel: c.channel,
        durationSec: c.durationSec,
        clip: { start: 0, end: c.durationSec, source: "whole" },
        verifiedAt: new Date().toISOString(),
      };
      useChat.getState().setVideoCacheEntry(cacheKey(exercise, opts.queryHint), { ...video });
      return { status: "found", video };
    }
    // c) Gemini video analysis, budgeted fallback.
    const clip = await analyzeWithGemini(c, exercise, {
      keys: opts.keys,
      model: opts.model,
      steps,
    });
    if (clip) {
      steps?.add(`Модель просмотрела «${c.title}» и нашла сегмент`);
      const video: VerifiedVideo = {
        videoId: c.videoId,
        title: c.title,
        channel: c.channel,
        durationSec: c.durationSec,
        clip: { start: clip.start, end: clip.end, source: "ai" },
        verifiedAt: new Date().toISOString(),
      };
      useChat.getState().setVideoCacheEntry(cacheKey(exercise, opts.queryHint), { ...video });
      return { status: "found", video };
    }
  }

  return { status: "not_found", note: "Таймкоды подтвердить не удалось (глав/анализа нет)." };
}
