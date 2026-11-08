import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SEED_EXERCISES, SEED_WORKOUTS } from "./seed";
import { DEFAULT_PLAN_SETTINGS, defaultPlan, planFromSchedule, reorderSteps } from "./plan";
import { DEFAULT_FFMPEG_OPTIONS, DEFAULT_FFMPEG_OUT } from "./video-rules";
import { DEFAULT_PHOTO_REMINDER, type PhotoReminderSettings } from "./photo-reminders";
import { DEFAULT_REMINDERS, migrateReminders, type ReminderSettings } from "./phrases";
import {
  normalizeMuscles,
  type Plan,
  type PlanStep,
  type AiSettings,
  type Exercise,
  type Feedback,
  type SessionLog,
  type Vacation,
  type Workout,
} from "./types";

export interface AppState {
  name: string;
  exercises: Exercise[];
  workouts: Workout[];
  sessions: SessionLog[];
  xp: number;
  /** Repeating plan cycle (workout / rest steps) with protection settings. */
  plan: Plan;
  vacations: Vacation[];
  ai: AiSettings;
  /** ffmpeg-api.com key for cloud video conversion (own key, on-device). */
  ffmpegKey: string;
  /** User-tunable ffmpeg output options (argv array) for cloud video conversion. */
  ffmpegOptions: string[];
  /** Output container for cloud video conversion (webm/mp4/webp). */
  ffmpegOut: string;
  reminders: ReminderSettings;
  lastNotified: string;
  /** Progress-photo reminder (every N days since the last photo). */
  photoReminder: PhotoReminderSettings;
  /** Day (yyyy-MM-dd) the photo reminder was already sent. */
  lastPhotoNotified: string;
  since: string;
  /** Welcome wizard shown once; existing installs migrate to `true`. */
  onboarded: boolean;
  voice: VoiceSettings;
  /** Session-execution settings (prep countdown before the first exercise). */
  workoutSettings: WorkoutSettings;
  /** Badge ids already celebrated (confetti shown once). */
  badgesSeen: string[];
  /** Monthly-challenge keys (yyyy-MM) already celebrated. */
  medalsSeen: string[];
}

export type SoundTheme = "spark" | "triumph" | "calm";

/** How the workout player behaves (execution, not data). */
export interface WorkoutSettings {
  /** Countdown before the very first exercise of a session (seconds, 0 = off). */
  prepSeconds: number;
}

export interface VoiceSettings {
  enabled: boolean;
  muted: boolean;
  beeps: boolean;
  metronome: boolean;
  bpm: number;
  cues: boolean;
  voiceURI: string;
  rate: number;
  volume: number;
  /** Victory-fanfare sound theme. */
  theme: SoundTheme;
}

interface Actions {
  set: (p: Partial<AppState>) => void;
  upsertExercise: (e: Exercise) => void;
  deleteExercise: (id: string) => void;
  /** Saves the user's difficulty/like feedback for an exercise (empty object clears it). */
  rateExercise: (id: string, feedback: Feedback) => void;
  upsertWorkout: (w: Workout) => void;
  deleteWorkout: (id: string) => void;
  /** Saves the user's difficulty/like feedback for a workout (empty object clears it). */
  rateWorkout: (id: string, feedback: Feedback) => void;
  /** Inserts a plan cycle step after the given index (use -1 to prepend). */
  addPlanStep: (afterIndex: number, step: PlanStep) => void;
  removePlanStep: (stepId: string) => void;
  /** Drag-and-drop reorder: moves one step from index `from` to index `to`. */
  reorderPlanStep: (from: number, to: number) => void;
  logSession: (s: SessionLog) => void;
  updateSession: (id: string, patch: Pick<SessionLog, "mood" | "note">) => void;
  importAll: (data: Partial<AppState>) => void;
  resetAll: () => void;
  /** Chat undo: replaces full affected-domain arrays from the snapshot. */
  restoreSnapshot: (
    snap: { exercises?: Exercise[]; workouts?: Workout[]; planSteps?: PlanStep[] } | undefined,
  ) => boolean;
  /** Full affected-domain arrays for a chat snapshot, deep-copied. */
  captureSnapshot: (domains: ("exercises" | "workouts" | "plan")[]) => {
    exercises?: Exercise[];
    workouts?: Workout[];
    planSteps?: PlanStep[];
  };
}

export const initialState: AppState = {
  name: "",
  exercises: SEED_EXERCISES,
  workouts: SEED_WORKOUTS,
  sessions: [],
  xp: 0,
  plan: defaultPlan(SEED_WORKOUTS),
  vacations: [],
  ai: {
    provider: "gemini",
    keys: [],
    baseUrl: "https://api.openai.com/v1",
    model: "gemini-2.5-flash",
  },
  ffmpegKey: "",
  ffmpegOptions: [...DEFAULT_FFMPEG_OPTIONS],
  ffmpegOut: "webm",
  reminders: { ...DEFAULT_REMINDERS },
  lastNotified: "",
  photoReminder: { ...DEFAULT_PHOTO_REMINDER },
  lastPhotoNotified: "",
  since: "",
  onboarded: false,
  voice: {
    enabled: true,
    muted: false,
    beeps: true,
    metronome: false,
    bpm: 60,
    cues: true,
    voiceURI: "",
    rate: 1.05,
    volume: 0.6,
    theme: "spark",
  },
  workoutSettings: { prepSeconds: 5 },
  badgesSeen: [],
  medalsSeen: [],
};

export const useApp = create<AppState & Actions>()(
  persist(
    (set, get) => ({
      ...initialState,
      set: (p) => set(p),
      upsertExercise: (e) =>
        set((s) => ({
          exercises: s.exercises.some((x) => x.id === e.id)
            ? s.exercises.map((x) => (x.id === e.id ? e : x))
            : [e, ...s.exercises],
        })),
      deleteExercise: (id) => set((s) => ({ exercises: s.exercises.filter((x) => x.id !== id) })),
      rateExercise: (id, feedback) =>
        set((s) => ({
          exercises: s.exercises.map((x) =>
            x.id === id
              ? {
                  ...x,
                  feedback: Object.keys(feedback).length
                    ? { ...x.feedback, ...feedback }
                    : undefined,
                }
              : x,
          ),
        })),
      upsertWorkout: (w) =>
        set((s) => ({
          workouts: s.workouts.some((x) => x.id === w.id)
            ? s.workouts.map((x) => (x.id === w.id ? w : x))
            : [...s.workouts, w],
        })),
      deleteWorkout: (id) => set((s) => ({ workouts: s.workouts.filter((x) => x.id !== id) })),
      rateWorkout: (id, feedback) =>
        set((s) => ({
          workouts: s.workouts.map((x) =>
            x.id === id
              ? {
                  ...x,
                  feedback: Object.keys(feedback).length
                    ? { ...x.feedback, ...feedback }
                    : undefined,
                }
              : x,
          ),
        })),
      /** Adds a step to the plan: a workout day or a rest day. */
      addPlanStep: (afterIndex, step) =>
        set((s) => ({
          plan: {
            ...s.plan,
            steps: [
              ...s.plan.steps.slice(0, afterIndex + 1),
              step,
              ...s.plan.steps.slice(afterIndex + 1),
            ],
          },
        })),
      /** Removes a step from the plan cycle. */
      removePlanStep: (stepId) =>
        set((s) => ({ plan: { ...s.plan, steps: s.plan.steps.filter((x) => x.id !== stepId) } })),
      /** Moves a step within the plan cycle (drag & drop). */
      reorderPlanStep: (from, to) =>
        set((s) => ({ plan: { ...s.plan, steps: reorderSteps(s.plan.steps, from, to) } })),
      logSession: (log) =>
        set((s) => ({
          sessions: [...s.sessions, log],
          xp: s.xp + log.xp,
        })),
      updateSession: (id, patch) =>
        set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
      importAll: (data) => set({ ...initialState, ...migrateState(data, 1) }),
      resetAll: () => set(initialState),
      captureSnapshot: (domains) => {
        const s = get();
        const snap: { exercises?: Exercise[]; workouts?: Workout[]; planSteps?: PlanStep[] } = {};
        const clone = <T>(v: T): T => structuredClone(v);
        if (domains.includes("exercises")) snap.exercises = s.exercises.map(clone);
        if (domains.includes("workouts")) snap.workouts = s.workouts.map(clone);
        if (domains.includes("plan")) snap.planSteps = s.plan.steps.map(clone);
        return snap;
      },
      restoreSnapshot: (snap) => {
        if (!snap) return false;
        const has = snap.exercises || snap.workouts || snap.planSteps;
        if (!has) return false;
        set((s) => ({
          ...(snap.exercises ? { exercises: snap.exercises } : {}),
          ...(snap.workouts ? { workouts: snap.workouts } : {}),
          ...(snap.planSteps ? { plan: { ...s.plan, steps: snap.planSteps } } : {}),
        }));
        return true;
      },
    }),
    {
      name: "pulse-fit-v1",
      version: 13,
      migrate: (persisted, from) =>
        migrateState(persisted as Partial<AppState>, from) as AppState & Actions,
    },
  ),
);

export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** v1 -> v2: legacy muscle keys become body-map muscles; fill new fields. v2 -> v3: badges/medals seen + sound theme. v3 -> v4: single ai.apiKey becomes ai.keys array. v4 -> v5: ffmpegKey for cloud video conversion. v5 -> v6: tunable ffmpegOptions/ffmpegOut. v6 -> v7: MuscleWiki removed (mwKey dropped, "musclewiki" sources become custom). v7 -> v8: weekly schedule becomes the repeating plan cycle. v8 -> v9: progress-photo reminders. v9 -> v10: `onboarded` flag — existing installs skip the welcome wizard. v10 -> v11: user feedback (difficulty 1-10 + like/dislike) on exercises/workouts — optional fields, nothing to backfill. v11 -> v12: reminders become a workout window (start/end) + preferred workout time. v12 -> v13: optional tapped rhythm pattern (`rhythm`) on exercises and workout items — new optional fields, nothing to backfill. */
export function migrateState(p: Partial<AppState>, from: number): Partial<AppState> {
  const out: Partial<AppState> = { ...p };
  // Fresh installs (unknown version) start the wizard; upgrades keep the old behaviour.
  if (typeof out.onboarded !== "boolean") out.onboarded = from > 0;
  delete (out as Record<string, unknown>)["mwKey"];
  delete (out as Record<string, unknown>)["schedule"];
  if (out.exercises)
    out.exercises = out.exercises.map((e) =>
      (e as { source?: string }).source === "musclewiki" ? { ...e, source: "custom" } : e,
    );
  if (from < 5 && typeof p.ffmpegKey !== "string") out.ffmpegKey = "";
  if (from < 6) {
    if (!Array.isArray(p.ffmpegOptions)) out.ffmpegOptions = [...DEFAULT_FFMPEG_OPTIONS];
    if (typeof p.ffmpegOut !== "string" || !p.ffmpegOut) out.ffmpegOut = DEFAULT_FFMPEG_OUT;
  }
  if (from < 8) {
    const origin = p.plan?.origin ?? p.since ?? new Date().toISOString().slice(0, 10);
    const legacy = (p as Record<string, unknown>)["schedule"] as
      { days: number[]; rotation: string[]; rotationIndex: number } | undefined;
    const persistedPlan = p.plan as Plan | undefined;
    out.plan = persistedPlan
      ? {
          ...defaultPlan(),
          ...persistedPlan,
          settings: { ...DEFAULT_PLAN_SETTINGS, ...(persistedPlan.settings ?? {}) },
        }
      : {
          steps: planFromSchedule(
            legacy ?? { days: [0, 2, 4], rotation: [], rotationIndex: 0 },
            p.workouts ?? [],
            origin,
            (i) => `step-${i}`,
          ),
          origin,
          settings: { ...DEFAULT_PLAN_SETTINGS },
        };
  }
  if (from < 2) {
    if (p.exercises)
      out.exercises = p.exercises.map((e) => ({
        ...e,
        muscles: normalizeMuscles(e.muscles as string[]),
      }));
    if (p.sessions)
      out.sessions = p.sessions.map((x) => ({
        ...x,
        sets: x.sets.map((st) => ({ ...st, muscles: normalizeMuscles(st.muscles as string[]) })),
      }));
  }
  out.voice = { ...initialState.voice, ...(p.voice ?? {}) };
  out.workoutSettings = { ...initialState.workoutSettings, ...(p.workoutSettings ?? {}) };
  // v11 -> v12: reminders become a workout window + preferred time.
  out.reminders = migrateReminders(p.reminders as { enabled: boolean; hour: number } | undefined);
  out.photoReminder = { ...DEFAULT_PHOTO_REMINDER, ...(p.photoReminder ?? {}) };
  if (typeof p.lastPhotoNotified !== "string") out.lastPhotoNotified = "";
  if (from < 3) {
    if (!Array.isArray(p.badgesSeen)) out.badgesSeen = [];
    if (!Array.isArray(p.medalsSeen)) out.medalsSeen = [];
  }
  if (from < 4) {
    const ai = p.ai as Partial<AiSettings> & { apiKey?: string };
    if (ai && !Array.isArray(ai.keys)) {
      out.ai = {
        provider: ai.provider ?? "gemini",
        keys: ai.apiKey ? [ai.apiKey] : [],
        baseUrl: ai.baseUrl ?? "https://api.openai.com/v1",
        model: ai.model ?? "gemini-2.5-flash",
      };
    }
  }
  return out;
}
