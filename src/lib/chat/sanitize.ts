import { CATEGORIES, MUSCLES, type Exercise, type PlanStep, type Workout } from "../types";
import { uid, useApp } from "../store";
import type { ActionKind, ChatAction, ChatPermissions } from "./types";

/**
 * Untrusted JSON decoded from the model's `actions[i].data` string.
 * Every field is revalidated below before it can reach the store.
 */
interface PayloadJson {
  id?: unknown;
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
  items?: unknown;
  exerciseId?: unknown;
  sets?: unknown;
  rest?: unknown;
  bpm?: unknown;
  step?: unknown;
  kind?: unknown;
  workoutId?: unknown;
  afterIndex?: unknown;
}

const str = (v: unknown, fallback: string, max = 240): string => {
  const s = typeof v === "string" ? v.trim() : "";
  return (s || fallback).slice(0, max);
};
const num = (v: unknown, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function sanitizeExerciseLike(j: PayloadJson, base?: Exercise): Exercise | null {
  const muscles = (Array.isArray(j.muscles) ? j.muscles : []).filter(
    (m): m is keyof typeof MUSCLES => typeof m === "string" && m in MUSCLES,
  );
  const name = str(j.name, base?.name ?? "", 120);
  if (!name) return null;
  const category =
    typeof j.category === "string" && j.category in CATEGORIES
      ? (j.category as Exercise["category"])
      : (base?.category ?? "strength");
  const mode = j.mode === "time" ? "time" : j.mode === "reps" ? "reps" : (base?.mode ?? "reps");
  const emojiRaw = typeof j.emoji === "string" ? Array.from(j.emoji.trim())[0] : undefined;
  const ex: Exercise = {
    id: base?.id ?? `ai-${uid()}`,
    name,
    muscles: muscles.length ? muscles : (base?.muscles ?? ["abs"]),
    category,
    mode,
    reps: Math.min(100, Math.max(1, Math.round(num(j.reps, base?.reps ?? 12)))),
    seconds: Math.min(1200, Math.max(5, Math.round(num(j.seconds, base?.seconds ?? 40)))),
    equipment: str(j.equipment, base?.equipment ?? "", 120),
    description: str(j.description, base?.description ?? "", 4000),
    steps: (Array.isArray(j.steps) ? j.steps : []).map((s) => str(s, "", 500)).filter(Boolean),
    mistakes: (Array.isArray(j.mistakes) ? j.mistakes : [])
      .map((s) => str(s, "", 500))
      .filter(Boolean),
    emoji: emojiRaw ?? base?.emoji,
    videoUrl: base?.videoUrl,
    clips: base?.clips,
    bpm: base?.bpm,
    mediaId: base?.mediaId,
    feedback: base?.feedback,
    source: base?.source ?? "ai",
  };
  return ex;
}

function sanitizeWorkout(
  j: PayloadJson,
  exerciseNameOf: (id: string) => string | undefined,
): Workout | null {
  const name = str(j.name, "", 120);
  if (!name) return null;
  const itemsRaw = Array.isArray(j.items) ? j.items : [];
  const items = itemsRaw
    .filter((it): it is PayloadJson => typeof it === "object" && it !== null)
    .map((it) => {
      const exerciseId = str(it.exerciseId, "", 60);
      if (!exerciseId || !exerciseNameOf(exerciseId)) return null;
      const bpmNum = Number(it.bpm);
      return {
        exerciseId,
        sets: Math.min(10, Math.max(1, Math.round(num(it.sets, 3)))),
        reps: Math.min(100, Math.max(1, Math.round(num(it.reps, 12)))),
        seconds: Math.min(1200, Math.max(5, Math.round(num(it.seconds, 40)))),
        rest: Math.min(300, Math.max(5, Math.round(num(it.rest, 60)))),
        ...(Number.isFinite(bpmNum) ? { bpm: Math.min(200, Math.max(40, Math.round(bpmNum))) } : {}),
      };
    })
    .filter((it): it is NonNullable<typeof it> => it !== null);
  if (!items.length) return null;
  const emojiRaw = typeof j.emoji === "string" ? Array.from(j.emoji.trim())[0] : undefined;
  return { id: `w-${uid()}`, name, emoji: emojiRaw ?? "💪", items };
}

function sanitizePlanStep(
  j: PayloadJson,
  workoutExists: (id: string) => boolean,
): { afterIndex: number; step: PlanStep } | null {
  const stepRaw = (typeof j.step === "object" && j.step !== null ? j.step : j) as PayloadJson;
  const kind = stepRaw.kind === "rest" ? "rest" : stepRaw.kind === "workout" ? "workout" : null;
  if (!kind) return null;
  const workoutId = str(stepRaw.workoutId, "", 60);
  if (kind === "workout" && (!workoutId || !workoutExists(workoutId))) return null;
  return {
    afterIndex: Math.max(-1, Math.round(num(j.afterIndex, -1))),
    step: kind === "workout" ? { id: uid(), kind, workoutId } : { id: uid(), kind },
  };
}

const KINDS = new Set<string>([
  "create_exercise",
  "update_exercise",
  "create_workout",
  "add_plan_step",
] satisfies ActionKind[]);
const DOMAIN_OF: Record<ActionKind, keyof ChatPermissions> = {
  create_exercise: "exercises",
  update_exercise: "exercises",
  create_workout: "workouts",
  add_plan_step: "plan",
};

function exerciseSummary(kind: ActionKind, ex: Exercise): string {
  const label = ex.mode === "time" ? `${ex.seconds} c` : `${ex.reps} повт.`;
  const muscles = ex.muscles
    .slice(0, 2)
    .map((m) => MUSCLES[m])
    .join(", ");
  return `${kind === "update_exercise" ? "Изменить" : "Добавить"}: ${ex.emoji ?? "🏋️"} ${ex.name} — ${muscles}, ${label}`;
}

/** Parses raw model actions into safe, ready-to-apply ChatActions; drops malformed ones silently. */
export function parseActions(
  rawActions: { kind: string; data: string }[] | undefined,
  perms: ChatPermissions,
  ctx: { exercises: Exercise[]; workouts: Workout[] },
): ChatAction[] {
  if (!rawActions?.length) return [];
  const out: ChatAction[] = [];
  for (const raw of rawActions.slice(0, 10)) {
    if (typeof raw?.kind !== "string" || typeof raw?.data !== "string") continue;
    if (!KINDS.has(raw.kind)) continue;
    const kind = raw.kind as ActionKind;
    const permission = perms[DOMAIN_OF[kind]];
    if (permission === "off") continue;
    let j: unknown;
    try {
      j = JSON.parse(raw.data);
    } catch {
      continue;
    }
    if (typeof j !== "object" || j === null) continue;
    const a = j as PayloadJson;
    if (kind === "create_exercise" || kind === "update_exercise") {
      const base =
        kind === "update_exercise"
          ? ctx.exercises.find((e) => e.id === str(a.id, "", 60))
          : undefined;
      if (!base) continue;
      const ex = sanitizeExerciseLike(a, base);
      if (!ex) continue;
      out.push({
        id: uid(),
        kind,
        payload: ex,
        summary: exerciseSummary(kind, ex),
        permission,
      });
    } else if (kind === "create_workout") {
      const w = sanitizeWorkout(a, (id) => ctx.exercises.find((e) => e.id === id)?.name);
      if (!w) continue;
      out.push({
        id: uid(),
        kind,
        payload: w,
        summary: `${w.emoji} ${w.name} — ${w.items.length} упр.`,
        permission,
      });
    } else {
      const p = sanitizePlanStep(a, (id) => ctx.workouts.some((w) => w.id === id));
      if (!p) continue;
      const w = p.step.workoutId ? ctx.workouts.find((x) => x.id === p.step.workoutId) : null;
      out.push({
        id: uid(),
        kind,
        payload: p,
        summary: p.step.kind === "rest" ? "Отдых в план" : `Тренировка «${w?.name}» в план`,
        permission,
      });
    }
    if (out.length >= 6) break;
  }
  return out;
}

/** Applies one confirmed action to the main store. Returns false when the target vanished. */
export function applyAction(action: ChatAction): boolean {
  const s = useApp.getState();
  if (action.kind === "create_exercise") {
    s.upsertExercise(action.payload as Exercise);
    return true;
  }
  if (action.kind === "update_exercise") {
    const ex = action.payload as Exercise;
    if (!s.exercises.some((e) => e.id === ex.id)) return false;
    s.upsertExercise(ex);
    return true;
  }
  if (action.kind === "create_workout") {
    s.upsertWorkout(action.payload as Workout);
    return true;
  }
  const p = action.payload as { afterIndex: number; step: PlanStep };
  s.addPlanStep(p.afterIndex, p.step);
  return true;
}
