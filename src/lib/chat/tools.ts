import type { Exercise, Workout } from "../types";
import { useApp } from "../store";
import { parseActions } from "./sanitize";
import type { ChatAction, ChatPermissions, ToolStepSink } from "./types";
import { findExerciseVideo, normalizeExName } from "./video";
import { registerVideo, resolveVideoRef } from "./refs";

/**
 * Client-side function-calling handlers: mutations go through the SAME
 * permission/sanitizing path as JSON-contract actions (parseActions), and the
 * same store save path (upsertExercise) as the paste-a-link mode. Every tool
 * exception becomes a clean tool response — never a crash, never silent.
 */

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolOutcome {
  /** Compact JSON response for the model (counts against TPM). */
  response: Record<string, unknown>;
  /** Pending confirmation card built by the handler (ask mode). */
  action?: ChatAction;
  /** Client already applied it (permission «always»). */
  applied?: boolean;
}

export interface ToolCtx {
  perms: ChatPermissions;
  read: () => { exercises: Exercise[]; workouts: Workout[] };
  steps?: ToolStepSink;
}

type ToolHandler = (args: Record<string, unknown>, ctx: ToolCtx) => Promise<ToolOutcome>;

function argStr(args: Record<string, unknown>, key: string, max = 200): string {
  const v = args[key];
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function argNum(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Wraps a handler so ANY throwable becomes a clean tool response (plan §9). */
function safe(name: string, handler: ToolHandler): ToolHandler {
  return async (args, ctx) => {
    try {
      return await handler(args, ctx);
    } catch (e) {
      return {
        response: {
          status: "error",
          message: `Инструмент ${name}: ${(e as Error)?.message ?? "неизвестная ошибка"}`.slice(
            0,
            400,
          ),
        },
      };
    }
  };
}

/* ---------------- find_exercise_video ---------------- */

const findVideo: ToolHandler = async (args, ctx) => {
  const exercise = argStr(args, "exercise_name", 160);
  if (!exercise) {
    return { response: { status: "error", message: "exercise_name обязателен." } };
  }
  const ai = useApp.getState().ai;
  const res = await findExerciseVideo({
    exercise,
    queryHint: argStr(args, "query_hint", 200) || undefined,
    keys: ai.keys,
    model: ai.model,
    youtubeKey: ai.youtubeKey,
    steps: ctx.steps,
  });
  if (res.status !== "found" || !res.video) {
    return {
      response: {
        status: res.status,
        note:
          res.note ??
          "Видео подтвердить не удалось. Предложите пользователю вставить ссылку самостоятельно.",
      },
    };
  }
  const video_ref = registerVideo(res.video);
  const clip = res.video.clip;
  ctx.steps?.add(
    `Нашёл видео «${res.video.title}»${clip ? ` · ${clip.start}–${clip.end} c` : " · целиком"}`,
  );
  return {
    response: {
      status: "found",
      video_ref,
      title: res.video.title,
      channel: res.video.channel,
      duration_sec: res.video.durationSec,
      clip: clip ? { start_sec: clip.start, end_sec: clip.end } : null,
      note: "Refer to videos ONLY through video_ref values returned by this tool.",
    },
  };
};

/* ---------------- add_video_to_exercise ---------------- */

const addVideoToExercise: ToolHandler = async (args, ctx) => {
  const name = argStr(args, "exercise_name", 120);
  if (!name) {
    return { response: { status: "error", message: "exercise_name обязателен." } };
  }
  const video = resolveVideoRef(args["video_ref"]);
  if (!video) {
    return {
      response: {
        status: "error",
        message: "video_ref неизвестен или истёк — сначала вызовите find_exercise_video.",
      },
    };
  }

  const { exercises } = ctx.read();
  const wanted = normalizeExName(name);
  const target = exercises.find((e) => {
    const have = normalizeExName(e.name);
    return wanted && (have.includes(wanted) || wanted.includes(have));
  });

  const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
  const clips = video.clip ? [{ start: video.clip.start, end: video.clip.end }] : undefined;

  const payload = target
    ? // Update existing: copy everything, ONLY the video fields change.
      {
        id: target.id,
        name: target.name,
        muscles: target.muscles,
        category: target.category,
        mode: target.mode,
        reps: target.reps,
        seconds: target.seconds,
        equipment: target.equipment,
        description: target.description,
        steps: target.steps,
        mistakes: target.mistakes,
        emoji: target.emoji,
        videoUrl,
        clips,
        bpm: target.bpm,
        mediaId: target.mediaId,
        feedback: target.feedback,
        source: target.source,
      }
    : // New exercise: the model supplies muscles/category per the schema.
      {
        name: name.slice(0, 120),
        muscles: Array.isArray(args["muscles"]) ? (args["muscles"] as unknown[]) : [],
        category: argStr(args, "category", 20) || undefined,
        mode: argStr(args, "mode", 10) || undefined,
        reps: argNum(args, "reps"),
        seconds: argNum(args, "seconds"),
        equipment: argStr(args, "equipment", 120),
        description: argStr(args, "description", 300),
        videoUrl,
        clips,
      };

  const kind = target ? "update_exercise" : "create_exercise";
  const perm = ctx.perms[kind === "update_exercise" ? "exercises" : "exercises"];
  if (perm === "off") {
    return {
      response: { status: "error", message: "Изменения упражнений запрещены настройками." },
    };
  }

  const [action] = parseActions([{ kind, data: JSON.stringify(payload) }], ctx.perms, {
    exercises,
    workouts: ctx.read().workouts,
  });
  if (!action) {
    if (target) {
      return {
        response: {
          status: "error",
          message: "Упражнение найдено, но собрать изменение не удалось.",
        },
      };
    }
    return {
      response: {
        status: "error",
        message: "Для нового упражнения передайте muscles (валидные ключи) и category.",
      },
    };
  }

  const clip = video.clip;
  ctx.steps?.add(
    target
      ? `Приготовил видео для «${target.name}»${clip ? ` · ${clip.start}–${clip.end} c` : ""}`
      : `Приготовил новое упражнение «${name}»${clip ? ` · ${clip.start}–${clip.end} c` : ""}`,
  );

  if (perm === "always") {
    return {
      response: {
        status: "applied",
        exercise_name: target?.name ?? name,
        video_title: video.title,
        clip: clip ? { start_sec: clip.start, end_sec: clip.end } : null,
        message: "Видео прикреплено сразу (права «всегда»).",
      },
      action,
      applied: true,
    };
  }
  return {
    response: {
      status: "pending_confirmation",
      exercise_name: action.summary,
      note: "Карточка показана пользователю; НЕ повторяйте это действие в actions.",
    },
    action,
  };
};

/* ---------------- create_workout ---------------- */

const createWorkout: ToolHandler = async (args, ctx) => {
  const name = argStr(args, "name", 120);
  const rawIds = Array.isArray(args["exercise_ids"])
    ? (args["exercise_ids"] as unknown[])
        .filter((x): x is string => typeof x === "string")
        .slice(0, 12)
    : [];
  if (!name) return { response: { status: "error", message: "name обязателен." } };
  if (!rawIds.length) {
    return {
      response: { status: "error", message: "exercise_ids обязателен (id только из каталога)." },
    };
  }

  const { exercises } = ctx.read();
  const sets = Array.isArray(args["sets"])
    ? (args["sets"] as unknown[]).map((v) => argNum({ v }, "v"))
    : [];
  const rest = Array.isArray(args["rest_sec"])
    ? (args["rest_sec"] as unknown[]).map((v) => argNum({ v }, "v"))
    : [];

  const items = rawIds.map((id, i) => {
    const ex = exercises.find((e) => e.id === id);
    if (!ex) return null; // parseActions drops fake ids; response says so.
    return {
      exerciseId: id,
      sets: sets[i] ?? 3,
      reps: ex.mode === "reps" ? ex.reps : undefined,
      seconds: ex.mode === "time" ? ex.seconds : undefined,
      rest: rest[i],
    };
  });

  const [action] = parseActions(
    [
      {
        kind: "create_workout",
        data: JSON.stringify({ name, emoji: argStr(args, "emoji", 8) || undefined, items }),
      },
    ],
    ctx.perms,
    { exercises, workouts: ctx.read().workouts },
  );
  if (!action) {
    return {
      response: {
        status: "error",
        message: "Тренировку собрать не удалось: все exercise_id вне каталога.",
      },
    };
  }

  const perm = ctx.perms.workouts;
  if (perm === "always") {
    return {
      response: { status: "applied", message: `Тренировка «${name}» создана (права «всегда»).` },
      action,
      applied: true,
    };
  }
  ctx.steps?.add(`Собрал карточку «${action.summary}»`);
  return {
    response: {
      status: "pending_confirmation",
      note: "Карточка показана пользователю; не дублируйте в actions.",
    },
    action,
  };
};

/* ---------------- add_plan_step ---------------- */

const addPlanStep: ToolHandler = async (args, ctx) => {
  const kind = argStr(args, "kind", 10);
  if (kind !== "workout" && kind !== "rest") {
    return { response: { status: "error", message: "kind — 'workout' | 'rest'." } };
  }
  const [action] = parseActions(
    [
      {
        kind: "add_plan_step",
        data: JSON.stringify({
          afterIndex: argNum(args, "after_index") ?? -1,
          step: { kind, workoutId: argStr(args, "workout_id", 60) },
        }),
      },
    ],
    ctx.perms,
    ctx.read(),
  );
  if (!action) {
    return {
      response: {
        status: "error",
        message: "Для шага-тренировки workout_id обязателен, id — только из каталога.",
      },
    };
  }
  const perm = ctx.perms.plan;
  if (perm === "always") {
    return {
      response: { status: "applied", message: "Шаг плана вставлен (права «всегда»)." },
      action,
      applied: true,
    };
  }
  ctx.steps?.add(`Шаг плана (${kind === "rest" ? "отдых" : "тренировка"}) на подтверждении`);
  return {
    response: { status: "pending_confirmation", note: "Карточка показана пользователю." },
    action,
  };
};

/* ---------------- get_exercise_details ---------------- */

const getExerciseDetails: ToolHandler = async (args, ctx) => {
  const { exercises } = ctx.read();
  const id = argStr(args, "exercise_id", 60);
  const ex = exercises.find((e) => e.id === id);
  if (!ex) {
    return {
      response: { status: "error", message: "Упражнение с таким id не найдено в каталоге." },
    };
  }
  return {
    response: {
      id: ex.id,
      name: ex.name,
      muscles: ex.muscles,
      category: ex.category,
      mode: ex.mode,
      reps: ex.mode === "reps" ? ex.reps : undefined,
      seconds: ex.mode === "time" ? ex.seconds : undefined,
      equipment: ex.equipment,
      description: ex.description.slice(0, 400),
      steps: ex.steps.slice(0, 8),
      mistakes: ex.mistakes.slice(0, 4),
      has_video: Boolean(ex.videoUrl),
      clips: ex.clips?.length,
      feedback: ex.feedback?.difficulty,
    },
  };
};

/* ---------------- registry ---------------- */

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  find_exercise_video: safe("find_exercise_video", findVideo),
  add_video_to_exercise: safe("add_video_to_exercise", addVideoToExercise),
  create_workout: safe("create_workout", createWorkout),
  add_plan_step: safe("add_plan_step", addPlanStep),
  get_exercise_details: safe("get_exercise_details", getExerciseDetails),
};

export function toolHandlerFor(name: string): ToolHandler | null {
  return TOOL_HANDLERS[name] ?? null;
}
