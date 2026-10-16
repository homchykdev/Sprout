import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SEED_EXERCISES, SEED_WORKOUTS } from "./seed";
import { DEFAULT_FFMPEG_OPTIONS, DEFAULT_FFMPEG_OUT } from "./video-rules";
import {
  normalizeMuscles,
  type AiSettings,
  type Exercise,
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
  schedule: { days: number[]; rotation: string[]; rotationIndex: number };
  vacations: Vacation[];
  ai: AiSettings;
  mwKey: string;
  /** ffmpeg-api.com key for cloud video conversion (own key, on-device). */
  ffmpegKey: string;
  /** User-tunable ffmpeg output options (argv array) for cloud video conversion. */
  ffmpegOptions: string[];
  /** Output container for cloud video conversion (webm/mp4/webp). */
  ffmpegOut: string;
  reminders: { enabled: boolean; hour: number };
  lastNotified: string;
  since: string;
  voice: VoiceSettings;
  /** Badge ids already celebrated (confetti shown once). */
  badgesSeen: string[];
  /** Monthly-challenge keys (yyyy-MM) already celebrated. */
  medalsSeen: string[];
}

export type SoundTheme = "spark" | "triumph" | "calm";

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
  upsertWorkout: (w: Workout) => void;
  deleteWorkout: (id: string) => void;
  logSession: (s: SessionLog) => void;
  updateSession: (id: string, patch: Pick<SessionLog, "mood" | "note">) => void;
  importAll: (data: Partial<AppState>) => void;
  resetAll: () => void;
}

export const initialState: AppState = {
  name: "",
  exercises: SEED_EXERCISES,
  workouts: SEED_WORKOUTS,
  sessions: [],
  xp: 0,
  schedule: { days: [0, 2, 4], rotation: SEED_WORKOUTS.map((w) => w.id), rotationIndex: 0 },
  vacations: [],
  ai: {
    provider: "gemini",
    keys: [],
    baseUrl: "https://api.openai.com/v1",
    model: "gemini-2.5-flash",
  },
  mwKey: "",
  ffmpegKey: "",
  ffmpegOptions: [...DEFAULT_FFMPEG_OPTIONS],
  ffmpegOut: "webm",
  reminders: { enabled: true, hour: 18 },
  lastNotified: "",
  since: "",
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
  badgesSeen: [],
  medalsSeen: [],
};

export const useApp = create<AppState & Actions>()(
  persist(
    (set) => ({
      ...initialState,
      set: (p) => set(p),
      upsertExercise: (e) =>
        set((s) => ({
          exercises: s.exercises.some((x) => x.id === e.id)
            ? s.exercises.map((x) => (x.id === e.id ? e : x))
            : [e, ...s.exercises],
        })),
      deleteExercise: (id) => set((s) => ({ exercises: s.exercises.filter((x) => x.id !== id) })),
      upsertWorkout: (w) =>
        set((s) => ({
          workouts: s.workouts.some((x) => x.id === w.id)
            ? s.workouts.map((x) => (x.id === w.id ? w : x))
            : [...s.workouts, w],
          schedule:
            s.schedule.rotation.includes(w.id) || s.workouts.some((x) => x.id === w.id)
              ? s.schedule
              : { ...s.schedule, rotation: [...s.schedule.rotation, w.id] },
        })),
      deleteWorkout: (id) =>
        set((s) => ({
          workouts: s.workouts.filter((x) => x.id !== id),
          schedule: { ...s.schedule, rotation: s.schedule.rotation.filter((r) => r !== id) },
        })),
      logSession: (log) =>
        set((s) => {
          const idx = s.schedule.rotation.indexOf(log.workoutId);
          return {
            sessions: [...s.sessions, log],
            xp: s.xp + log.xp,
            schedule: idx >= 0 ? { ...s.schedule, rotationIndex: idx + 1 } : s.schedule,
          };
        }),
      updateSession: (id, patch) =>
        set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
      importAll: (data) => set({ ...initialState, ...migrateState(data, 1) }),
      resetAll: () => set(initialState),
    }),
    {
      name: "pulse-fit-v1",
      version: 6,
      migrate: (persisted, from) =>
        migrateState(persisted as Partial<AppState>, from) as AppState & Actions,
    },
  ),
);

export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** v1 -> v2: legacy muscle keys become body-map muscles; fill new fields. v2 -> v3: badges/medals seen + sound theme. v3 -> v4: single ai.apiKey becomes ai.keys array. v4 -> v5: ffmpegKey for cloud video conversion. v5 -> v6: tunable ffmpegOptions/ffmpegOut. */
export function migrateState(p: Partial<AppState>, from: number): Partial<AppState> {
  const out: Partial<AppState> = { ...p };
  if (from < 5 && typeof p.ffmpegKey !== "string") out.ffmpegKey = "";
  if (from < 6) {
    if (!Array.isArray(p.ffmpegOptions)) out.ffmpegOptions = [...DEFAULT_FFMPEG_OPTIONS];
    if (typeof p.ffmpegOut !== "string" || !p.ffmpegOut) out.ffmpegOut = DEFAULT_FFMPEG_OUT;
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
