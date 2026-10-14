export const MUSCLES = {
  chest: "Грудь",
  "front-deltoids": "Передние дельты",
  "back-deltoids": "Задние дельты",
  biceps: "Бицепс",
  triceps: "Трицепс",
  forearm: "Предплечья",
  abs: "Пресс",
  obliques: "Косые",
  trapezius: "Трапеции",
  "upper-back": "Верх спины",
  "lower-back": "Поясница",
  neck: "Шея",
  gluteal: "Ягодицы",
  quadriceps: "Квадрицепс",
  hamstring: "Бицепс бедра",
  adductor: "Приводящие",
  abductors: "Отводящие",
  calves: "Икры",
} as const;
export type MuscleKey = keyof typeof MUSCLES;

export const CATEGORIES = { strength: "Сила", cardio: "Кардио", stretch: "Растяжка" } as const;
export type Category = keyof typeof CATEGORIES;

export interface Exercise {
  id: string;
  name: string;
  muscles: MuscleKey[];
  category: Category;
  mode: "reps" | "time";
  reps: number;
  seconds: number;
  equipment: string;
  description: string;
  steps: string[];
  mistakes: string[];
  videoUrl?: string | undefined;
  /** YouTube/video segments to loop, seconds. */
  clips?: { start: number; end: number }[] | undefined;
  /** Metronome tempo for this exercise, beats/min; absent = off. */
  bpm?: number | undefined;
  /** User-uploaded photo/video stored on device (media.ts). */
  mediaId?: string | undefined;
  emoji?: string | undefined;
  source: "seed" | "musclewiki" | "custom" | "ai";
}

export interface WorkoutItem {
  exerciseId: string;
  sets: number;
  reps: number;
  seconds: number;
  rest: number;
}

export interface Workout {
  id: string;
  name: string;
  emoji: string;
  items: WorkoutItem[];
}

export interface SessionLog {
  id: string;
  date: string; // ISO
  workoutId: string;
  workoutName: string;
  durationSec: number;
  xp: number;
  sets: { exerciseId: string; muscles: MuscleKey[]; category: Category; count: number }[];
}

export interface AiSettings {
  provider: "gemini" | "openai";
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface Vacation {
  start: string; // yyyy-MM-dd
  end: string;
}

const LEGACY: Record<string, MuscleKey[]> = {
  shoulders: ["front-deltoids", "back-deltoids"], forearms: ["forearm"], traps: ["trapezius"], lats: ["upper-back"],
  lower_back: ["lower-back"], glutes: ["gluteal"], quads: ["quadriceps"], hamstrings: ["hamstring"],
};
/** Converts legacy (v1) muscle keys to the current map keys. */
export const normalizeMuscles = (list: string[]): MuscleKey[] =>
  Array.from(new Set(list.flatMap((m) => (m in MUSCLES ? [m as MuscleKey] : LEGACY[m] ?? []))));
