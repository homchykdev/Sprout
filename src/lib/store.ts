import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SEED_EXERCISES, SEED_WORKOUTS } from "./seed";
import { normalizeMuscles, type AiSettings, type Exercise, type SessionLog, type Vacation, type Workout } from "./types";

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
  reminders: { enabled: boolean; hour: number };
  lastNotified: string;
  since: string;
  voice: VoiceSettings;
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
}

interface Actions {
  set: (p: Partial<AppState>) => void;
  upsertExercise: (e: Exercise) => void;
  deleteExercise: (id: string) => void;
  upsertWorkout: (w: Workout) => void;
  deleteWorkout: (id: string) => void;
  logSession: (s: SessionLog) => void;
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
  ai: { provider: "gemini", apiKey: "", baseUrl: "https://api.openai.com/v1", model: "gemini-2.5-flash" },
  mwKey: "",
  reminders: { enabled: true, hour: 18 },
  lastNotified: "",
  since: "",
  voice: { enabled: true, muted: false, beeps: true, metronome: false, bpm: 60, cues: true, voiceURI: "", rate: 1.05, volume: 0.6 },
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
          schedule: s.schedule.rotation.includes(w.id) || s.workouts.some((x) => x.id === w.id)
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
      importAll: (data) => set({ ...initialState, ...migrateState(data, 1) }),
      resetAll: () => set(initialState),
    }),
    {
      name: "pulse-fit-v1",
      version: 2,
      migrate: (persisted, from) => migrateState(persisted as Partial<AppState>, from) as AppState & Actions,
    },
  ),
);

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** v1 -> v2: legacy muscle keys become body-map muscles; fill new fields. */
export function migrateState(p: Partial<AppState>, from: number): Partial<AppState> {
  const out: Partial<AppState> = { ...p };
  if (from < 2) {
    if (p.exercises) out.exercises = p.exercises.map((e) => ({ ...e, muscles: normalizeMuscles(e.muscles as string[]) }));
    if (p.sessions)
      out.sessions = p.sessions.map((x) => ({ ...x, sets: x.sets.map((st) => ({ ...st, muscles: normalizeMuscles(st.muscles as string[]) })) }));
  }
  out.voice = { ...initialState.voice, ...(p.voice ?? {}) };
  return out;
}
