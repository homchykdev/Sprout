import { aiSplitWorkout, askAi, pingAi } from "./ai.functions";
import { promoteKey } from "./ai-keys";
import { ffmpegPing } from "./ffmpeg.functions";
import { useApp, uid } from "./store";
import {
  CATEGORIES,
  MUSCLES,
  type AiSettings,
  type Category,
  type Exercise,
  type MuscleKey,
  type Workout,
} from "./types";

// ---------- Exercise muscle mapping ----------
// English muscle names -> body-map muscles. Order matters (specific first).
const EN_MAP: [RegExp, MuscleKey[]][] = [
  [/front.*(shoulder|delt)|anterior delt/i, ["front-deltoids"]],
  [/rear.*(shoulder|delt)|posterior delt/i, ["back-deltoids"]],
  [/lateral delt|side delt/i, ["front-deltoids", "back-deltoids"]],
  [/^shoulders?$|^delts?$/i, ["front-deltoids", "back-deltoids"]],
  [/chest|pec/i, ["chest"]],
  [/bicep(?!s femoris)/i, ["biceps"]],
  [/tricep/i, ["triceps"]],
  [/forearm|wrist/i, ["forearm"]],
  [/oblique/i, ["obliques"]],
  [/ab(s|dominal)/i, ["abs"]],
  [/trap/i, ["trapezius"]],
  [/lats?\b|latissimus|upper back|rhomboid|mid.?back/i, ["upper-back"]],
  [/lower back|erector/i, ["lower-back"]],
  [/neck/i, ["neck"]],
  [/glute/i, ["gluteal"]],
  [/quad/i, ["quadriceps"]],
  [/hamstring|biceps femoris/i, ["hamstring"]],
  [/calv|soleus|gastro/i, ["calves"]],
  [/adductor|inner thigh|groin/i, ["adductor"]],
  [/abductor|outer thigh|hip/i, ["abductors"]],
];
export const mapMuscles = (list: string[]) => {
  const out = new Set<MuscleKey>();
  for (const m of list) {
    const t = m.trim();
    // Canonical keys pass through (AI returns these); English names via regex.
    if (t in MUSCLES) {
      out.add(t as MuscleKey);
      continue;
    }
    const hit = EN_MAP.find(([r]) => r.test(t));
    hit?.[1].forEach((k) => out.add(k));
  }
  return Array.from(out);
};
export const mapCategory = (c: string): Category =>
  /stretch|yoga/i.test(c) ? "stretch" : /cardio/i.test(c) ? "cardio" : "strength";

/** Direct/link video URLs are used as-is. */
export async function signedVideo(url?: string) {
  return url;
}

// ---------- Health checks (cheap, no quota spent on generation) ----------

/** Returns a human line like "Ключ 2 работает · 340 мс". Throws a Russian error otherwise. */
export async function checkAiKeys(override?: AiSettings): Promise<string> {
  const ai = override ?? useApp.getState().ai;
  if (!ai.keys.length) throw new Error("Добавьте ключ ИИ в настройках");
  const r = await pingAi({ data: { provider: ai.provider, keys: ai.keys, baseUrl: ai.baseUrl } });
  if (r.keyIndex > 0 && !override) {
    useApp.getState().set({ ai: { ...ai, keys: promoteKey(ai.keys, r.keyIndex) } });
  }
  return `Ключ ${r.keyIndex + 1} работает · ${r.ms} мс`;
}

/** Verifies the ffmpeg-api.com key via a cheap directory listing (no quota spent). */
export async function checkFfmpegKey(override?: string): Promise<string> {
  const key = override ?? useApp.getState().ffmpegKey;
  if (!key) throw new Error("Сначала вставьте ключ ffmpeg-api.com");
  const { ms } = await ffmpegPing({ data: { apiKey: key } });
  return `Ключ работает · ${ms} мс`;
}

// ---------- AI ----------
const EX_SCHEMA = `{"name":string,"muscles":string[] (из: ${Object.keys(MUSCLES).join(", ")}; первая — основная),"category":"strength"|"cardio"|"stretch","mode":"reps"|"time","reps":number,"seconds":number,"equipment":string,"description":string,"steps":string[],"mistakes":string[],"emoji":string}`;

async function ask(system: string, prompt: string) {
  const ai = useApp.getState().ai;
  if (!ai.keys.length) throw new Error("Добавьте ключ ИИ в настройках");
  const { text, keyIndex } = await askAi({ data: { ...ai, keys: ai.keys, system, prompt } });
  if (keyIndex > 0) {
    // Prefer the key that still has quota next time.
    useApp.getState().set({ ai: { ...ai, keys: promoteKey(ai.keys, keyIndex) } });
  }
  const clean = text
    .replace(/^```(json)?/m, "")
    .replace(/```\s*$/m, "")
    .trim();
  return JSON.parse(clean);
}

/** Untrusted JSON decoded from a model response; every field is validated below. */
interface ExerciseJson {
  name?: unknown;
  muscles?: unknown;
  category?: unknown;
  mode?: unknown;
  reps?: unknown;
  seconds?: unknown;
  equipment?: unknown;
  description?: unknown;
  steps?: unknown;
  mistakes?: unknown;
  emoji?: unknown;
}

function sanitizeExercise(j: ExerciseJson, base?: Partial<Exercise>): Exercise {
  const muscles = ((Array.isArray(j.muscles) ? j.muscles : []) as string[]).filter(
    (m): m is MuscleKey => m in MUSCLES,
  );
  return {
    id: base?.id ?? `ai-${uid()}`,
    name: String(j.name ?? base?.name ?? "Упражнение"),
    muscles: muscles.length ? muscles : (base?.muscles ?? ["abs"]),
    category:
      typeof j.category === "string" && j.category in CATEGORIES
        ? (j.category as Category)
        : (base?.category ?? "strength"),
    mode: j.mode === "time" ? "time" : "reps",
    reps: Number(j.reps) || 12,
    seconds: Number(j.seconds) || 40,
    equipment: String(j.equipment ?? ""),
    description: String(j.description ?? ""),
    steps: (Array.isArray(j.steps) ? j.steps : []).map(String),
    mistakes: (Array.isArray(j.mistakes) ? j.mistakes : []).map(String),
    emoji: j.emoji ? String(j.emoji) : base?.emoji,
    videoUrl: base?.videoUrl,
    source: base?.source ?? "ai",
  };
}

const SYS = "Ты — опытный тренер. Отвечай строго валидным JSON на русском языке, кратко и по делу.";

export async function aiCreateExercise(request: string) {
  const j = await ask(SYS, `Создай упражнение по запросу: "${request}". Верни JSON: ${EX_SCHEMA}`);
  return sanitizeExercise(j);
}

/** Model-provided sets, clamped to a sane range. Default 1 when the video says nothing. */
export function clampSets(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : NaN;
  return Number.isNaN(v) ? 1 : Math.min(10, Math.max(1, v));
}

/** Model-provided tempo, kept only inside the plausible range. */
export function clampTempoBpm(n: unknown): number | undefined {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : NaN;
  return Number.isNaN(v) || v < 40 || v > 200 ? undefined : v;
}

/** Result of a YouTube split: exercises plus per-exercise sets keyed by exercise id. */
export interface SplitWorkout {
  exercises: Exercise[];
  sets: Record<string, number>;
}

/** Splits a public YouTube workout video into exercises (Gemini only). Clips reference the same video. */
export async function aiSplitYoutube(youtubeUrl: string): Promise<SplitWorkout> {
  const ai = useApp.getState().ai;
  if (ai.provider !== "gemini")
    throw new Error(
      "Разбор видео доступен только с провайдером Gemini. Переключите его в настройках.",
    );
  if (!ai.keys.length) throw new Error("Добавьте ключ ИИ в настройках");
  const { exercises, keyIndex } = await aiSplitWorkout({
    data: { keys: ai.keys, model: ai.model, youtubeUrl },
  });
  if (keyIndex > 0) {
    useApp.getState().set({ ai: { ...ai, keys: promoteKey(ai.keys, keyIndex) } });
  }
  const out: Exercise[] = [];
  const sets: Record<string, number> = {};
  for (const e of exercises) {
    const bpm = clampTempoBpm(e.tempoBpm);
    const ex: Exercise = {
      ...sanitizeExercise(
        { ...e, muscles: mapMuscles(e.muscles), category: mapCategory(e.category) },
        { id: `ai-${uid()}`, videoUrl: youtubeUrl, source: "ai" as const },
      ),
      ...(bpm ? { bpm } : {}),
      clips: e.clips.length ? e.clips : undefined,
    };
    out.push(ex);
    sets[ex.id] = clampSets(e.sets);
  }
  return { exercises: out, sets };
}

/** Builds a ready workout from a YouTube split (selected exercises only). */
export function buildWorkoutFromSplit(split: SplitWorkout, ids: string[], name: string): Workout {
  const picked = split.exercises.filter((e) => ids.includes(e.id));
  return {
    id: `w-${uid()}`,
    name: name.trim() || "Комплекс с YouTube",
    emoji: "🎬",
    items: picked.map((e) => ({
      exerciseId: e.id,
      sets: split.sets[e.id] ?? 1,
      reps: e.reps,
      seconds: e.seconds,
      rest: e.category === "strength" ? 60 : 30,
      ...(e.bpm ? { bpm: e.bpm } : {}),
    })),
  };
}

export async function aiImproveExercise(ex: Exercise, wish: string) {
  const j = await ask(
    SYS,
    `Улучши описание упражнения (переведи на русский, если нужно). Пожелание: "${wish || "сделай понятнее, добавь частые ошибки"}". Текущее: ${JSON.stringify({ ...ex, videoUrl: undefined })}. Верни JSON: ${EX_SCHEMA}`,
  );
  return sanitizeExercise(j, ex);
}

export async function aiCreateWorkout(goal: string, library: Exercise[]): Promise<Workout> {
  const lib = library
    .map((e) => `${e.id}|${e.name}|${e.category}|${e.mode}|${e.muscles.join(",")}`)
    .join("\n");
  const j = await ask(
    SYS,
    `Составь тренировку. Цель: "${goal}". Используй ТОЛЬКО упражнения из библиотеки (id|название|категория|режим|мышцы):\n${lib}\nНачни с разминки, закончи растяжкой. Верни JSON: {"name":string,"emoji":string,"items":[{"exerciseId":string,"sets":number,"reps":number,"seconds":number,"rest":number}]}`,
  );
  const ids = new Set(library.map((e) => e.id));
  interface WorkoutItemJson {
    exerciseId?: unknown;
    sets?: unknown;
    reps?: unknown;
    seconds?: unknown;
    rest?: unknown;
  }
  const items = (Array.isArray(j.items) ? j.items : []) as WorkoutItemJson[];
  return {
    id: `w-${uid()}`,
    name: String(j.name ?? "Моя тренировка"),
    emoji: String(j.emoji ?? "⚡"),
    items: items
      .filter(
        (i): i is WorkoutItemJson & { exerciseId: string } =>
          typeof i.exerciseId === "string" && ids.has(i.exerciseId),
      )
      .map((i) => ({
        exerciseId: i.exerciseId,
        sets: Number(i.sets) || 2,
        reps: Number(i.reps) || 12,
        seconds: Number(i.seconds) || 40,
        rest: Number(i.rest) || 45,
      })),
  };
}
