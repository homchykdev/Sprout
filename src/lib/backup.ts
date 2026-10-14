import { initialState, migrateState, useApp, type AppState } from "./store";

export const SECTIONS = {
  progress: { label: "Прогресс", hint: "история, опыт, серия", keys: ["sessions", "xp", "since"] },
  library: { label: "Библиотека упражнений", hint: "все упражнения", keys: ["exercises"] },
  workouts: { label: "Тренировки и расписание", hint: "тренировки, дни, план", keys: ["workouts", "schedule"] },
  vacations: { label: "Отпуска", hint: "периоды отпуска", keys: ["vacations"] },
  prefs: { label: "Настройки", hint: "имя, напоминания, голос", keys: ["name", "reminders", "voice"] },
  keys: { label: "Ключи", hint: "MuscleWiki и ИИ", keys: ["mwKey", "ai"] },
} as const satisfies Record<string, { label: string; hint: string; keys: (keyof AppState)[] }>;
export type SectionId = keyof typeof SECTIONS;
export type Strategy = "replace" | "merge";

export function buildBackup(ids: SectionId[]) {
  const s = useApp.getState();
  const sections: Record<string, Partial<AppState>> = {};
  for (const id of ids) sections[id] = Object.fromEntries(SECTIONS[id].keys.map((k) => [k, s[k]]));
  return { app: "pulse", version: 2, createdAt: new Date().toISOString(), sections };
}

/** Parses v1 (flat data) and v2 (sectioned) backups into sections. */
export function parseBackup(text: string): Partial<Record<SectionId, Partial<AppState>>> {
  const j = JSON.parse(text);
  if (j?.app !== "pulse") throw new Error("not pulse");
  if (j.version === 2 && j.sections) {
    const out: Partial<Record<SectionId, Partial<AppState>>> = {};
    for (const id of Object.keys(SECTIONS) as SectionId[]) if (j.sections[id]) out[id] = migrateState(j.sections[id], 2);
    return out;
  }
  if (j.data) {
    const data = migrateState(j.data, 1) as Record<string, unknown>;
    const out: Partial<Record<SectionId, Partial<AppState>>> = {};
    for (const id of Object.keys(SECTIONS) as SectionId[]) {
      const part = Object.fromEntries(SECTIONS[id].keys.filter((k) => k in data).map((k) => [k, data[k]]));
      if (Object.keys(part).length) out[id] = part as Partial<AppState>;
    }
    return out;
  }
  throw new Error("bad");
}

const byId = <T extends { id: string }>(cur: T[], inc: T[] = []) => {
  const seen = new Set(cur.map((x) => x.id));
  return [...cur, ...inc.filter((x) => !seen.has(x.id))];
};

export function applyBackup(parts: Partial<Record<SectionId, Partial<AppState>>>, plan: Partial<Record<SectionId, Strategy>>) {
  const s = useApp.getState();
  const patch: Partial<AppState> = {};
  for (const [id, strat] of Object.entries(plan) as [SectionId, Strategy][]) {
    const p = parts[id];
    if (!p) continue;
    if (strat === "replace") {
      for (const k of SECTIONS[id].keys) (patch as Record<string, unknown>)[k] = p[k] ?? initialState[k];
      continue;
    }
    if (id === "progress") {
      const sessions = byId(s.sessions, p.sessions).sort((a, b) => a.date.localeCompare(b.date));
      patch.sessions = sessions;
      patch.xp = s.xp + (p.sessions ?? []).filter((x) => !s.sessions.some((y) => y.id === x.id)).reduce((a, x) => a + x.xp, 0);
      if (p.since && (!s.since || p.since < s.since)) patch.since = p.since;
    } else if (id === "library") patch.exercises = byId(s.exercises, p.exercises);
    else if (id === "workouts") {
      patch.workouts = byId(s.workouts, p.workouts);
      const rot = [...s.schedule.rotation, ...(p.schedule?.rotation ?? []).filter((r) => !s.schedule.rotation.includes(r))];
      patch.schedule = { ...s.schedule, days: Array.from(new Set([...s.schedule.days, ...(p.schedule?.days ?? [])])).sort(), rotation: rot };
    } else if (id === "vacations") {
      const key = (v: { start: string; end: string }) => v.start + v.end;
      const have = new Set(s.vacations.map(key));
      patch.vacations = [...s.vacations, ...(p.vacations ?? []).filter((v) => !have.has(key(v)))];
    } else {
      for (const k of SECTIONS[id].keys) if (p[k] !== undefined && p[k] !== "") (patch as Record<string, unknown>)[k] = p[k];
    }
  }
  s.set(patch);
}
