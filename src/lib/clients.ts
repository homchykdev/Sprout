import { askAi } from "./ai.functions";
import { mwGet, mwMediaToken, mwSearch } from "./musclewiki.functions";
import { useMwCache } from "./mw-cache";
import { useApp, uid } from "./store";
import { CATEGORIES, MUSCLES, type Category, type Exercise, type MuscleKey, type Workout } from "./types";

// ---------- MuscleWiki ----------
// MuscleWiki muscle names -> body-map muscles. Order matters (specific first).
const MW_MAP: [RegExp, MuscleKey[]][] = [
  [/front.*(shoulder|delt)|anterior delt/i, ["front-deltoids"]],
  [/rear.*(shoulder|delt)|posterior delt/i, ["back-deltoids"]],
  [/lateral delt|side delt/i, ["front-deltoids", "back-deltoids"]],
  [/^shoulders?$|^delts?$/i, ["front-deltoids", "back-deltoids"]],
  [/chest|pec/i, ["chest"]], [/bicep(?!s femoris)/i, ["biceps"]], [/tricep/i, ["triceps"]],
  [/forearm|wrist/i, ["forearm"]], [/oblique/i, ["obliques"]], [/ab(s|dominal)/i, ["abs"]],
  [/trap/i, ["trapezius"]], [/lats?\b|latissimus|upper back|rhomboid|mid.?back/i, ["upper-back"]],
  [/lower back|erector/i, ["lower-back"]], [/neck/i, ["neck"]], [/glute/i, ["gluteal"]],
  [/quad/i, ["quadriceps"]], [/hamstring|biceps femoris/i, ["hamstring"]], [/calv|soleus|gastro/i, ["calves"]],
  [/adductor|inner thigh|groin/i, ["adductor"]], [/abductor|outer thigh|hip/i, ["abductors"]],
];
export const mapMuscles = (list: string[]) => {
  const out = new Set<MuscleKey>();
  for (const m of list) {
    const hit = MW_MAP.find(([r]) => r.test(m.trim()));
    hit?.[1].forEach((k) => out.add(k));
  }
  return Array.from(out);
};
export const mapCategory = (c: string): Category => (/stretch|yoga/i.test(c) ? "stretch" : /cardio/i.test(c) ? "cardio" : "strength");

export async function importFromMuscleWiki(id: number): Promise<Exercise> {
  const key = useApp.getState().mwKey;
  const cache = useMwCache.getState();
  let x = cache.exercises[id];
  if (!x) {
    x = await mwGet({ data: { apiKey: key, id } });
    cache.putExercise(id, x);
  }
  const cat = mapCategory(x.category);
  return {
    id: `mw-${x.id}`,
    name: x.name,
    muscles: mapMuscles(x.muscles).length ? mapMuscles(x.muscles) : ["abs"],
    category: cat,
    mode: cat === "strength" ? "reps" : "time",
    reps: 12,
    seconds: 40,
    equipment: x.category,
    description: x.difficulty ? `Сложность: ${x.difficulty}` : "",
    steps: x.steps,
    mistakes: [],
    videoUrl: x.videoUrl ?? undefined,
    source: "musclewiki",
  };
}

export async function searchMuscleWiki(q: string) {
  const k = q.trim().toLowerCase();
  const cache = useMwCache.getState();
  if (cache.searches[k]) return cache.searches[k]!;
  const res = await mwSearch({ data: { apiKey: useApp.getState().mwKey, q: k } });
  cache.putSearch(k, res);
  return res;
}

export async function signedVideo(url?: string) {
  if (!url) return undefined;
  if (!url.includes("api.musclewiki.com/stream")) return url;
  const key = useApp.getState().mwKey;
  if (!key) return undefined;
  const cache = useMwCache.getState();
  let tok = cache.token;
  if (!tok || tok.until < Date.now()) {
    const t = await mwMediaToken({ data: { apiKey: key } });
    tok = { token: t.token, until: Date.now() + (t.expiresIn - 30) * 1000 };
    cache.putToken(tok);
  }
  return `${url}${url.includes("?") ? "&" : "?"}token=${tok.token}`;
}

// ---------- AI ----------
const EX_SCHEMA = `{"name":string,"muscles":string[] (из: ${Object.keys(MUSCLES).join(", ")}; первая — основная),"category":"strength"|"cardio"|"stretch","mode":"reps"|"time","reps":number,"seconds":number,"equipment":string,"description":string,"steps":string[],"mistakes":string[],"emoji":string}`;

async function ask(system: string, prompt: string) {
  const ai = useApp.getState().ai;
  if (!ai.apiKey) throw new Error("Добавьте ключ ИИ в настройках");
  const { text } = await askAi({ data: { ...ai, system, prompt } });
  const clean = text.replace(/^```(json)?/m, "").replace(/```\s*$/m, "").trim();
  return JSON.parse(clean);
}

function sanitizeExercise(j: any, base?: Partial<Exercise>): Exercise {
  const muscles = ((j.muscles ?? []) as string[]).filter((m): m is MuscleKey => m in MUSCLES);
  return {
    id: base?.id ?? `ai-${uid()}`,
    name: String(j.name ?? base?.name ?? "Упражнение"),
    muscles: muscles.length ? muscles : (base?.muscles ?? ["abs"]),
    category: (j.category in CATEGORIES ? j.category : base?.category ?? "strength") as Category,
    mode: j.mode === "time" ? "time" : "reps",
    reps: Number(j.reps) || 12,
    seconds: Number(j.seconds) || 40,
    equipment: String(j.equipment ?? ""),
    description: String(j.description ?? ""),
    steps: (j.steps ?? []).map(String),
    mistakes: (j.mistakes ?? []).map(String),
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

export async function aiImproveExercise(ex: Exercise, wish: string) {
  const j = await ask(SYS, `Улучши описание упражнения (переведи на русский, если нужно). Пожелание: "${wish || "сделай понятнее, добавь частые ошибки"}". Текущее: ${JSON.stringify({ ...ex, videoUrl: undefined })}. Верни JSON: ${EX_SCHEMA}`);
  return sanitizeExercise(j, ex);
}

export async function aiCreateWorkout(goal: string, library: Exercise[]): Promise<Workout> {
  const lib = library.map((e) => `${e.id}|${e.name}|${e.category}|${e.mode}|${e.muscles.join(",")}`).join("\n");
  const j = await ask(
    SYS,
    `Составь тренировку. Цель: "${goal}". Используй ТОЛЬКО упражнения из библиотеки (id|название|категория|режим|мышцы):\n${lib}\nНачни с разминки, закончи растяжкой. Верни JSON: {"name":string,"emoji":string,"items":[{"exerciseId":string,"sets":number,"reps":number,"seconds":number,"rest":number}]}`,
  );
  const ids = new Set(library.map((e) => e.id));
  return {
    id: `w-${uid()}`,
    name: String(j.name ?? "Моя тренировка"),
    emoji: String(j.emoji ?? "⚡"),
    items: ((j.items ?? []) as any[])
      .filter((i) => ids.has(i.exerciseId))
      .map((i) => ({ exerciseId: i.exerciseId, sets: Number(i.sets) || 2, reps: Number(i.reps) || 12, seconds: Number(i.seconds) || 40, rest: Number(i.rest) || 45 })),
  };
}
