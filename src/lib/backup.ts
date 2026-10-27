import { initialState, migrateState, useApp, type AppState } from "./store";
import type { Plan } from "./types";

export const SECTIONS = {
  progress: { label: "Прогресс", hint: "история, опыт, серия", keys: ["sessions", "xp", "since"] },
  library: { label: "Библиотека упражнений", hint: "все упражнения", keys: ["exercises"] },
  workouts: {
    label: "Тренировки и план",
    hint: "тренировки, цикл плана",
    keys: ["workouts", "plan"],
  },
  vacations: { label: "Отпуска", hint: "периоды отпуска", keys: ["vacations"] },
  prefs: {
    label: "Настройки",
    hint: "имя, напоминания, голос",
    keys: ["name", "reminders", "voice", "photoReminder"],
  },
  keys: {
    label: "Ключи",
    hint: "ИИ и ffmpeg",
    keys: ["ai", "ffmpegKey", "ffmpegOptions", "ffmpegOut"],
  },
} as const satisfies Record<string, { label: string; hint: string; keys: (keyof AppState)[] }>;
export type SectionId = keyof typeof SECTIONS;
export type Strategy = "replace" | "merge";

/** File slug per section: pulse-<slug>-YYYY-MM-DD.json */
export const FILE_SLUG: Record<SectionId, string> = {
  progress: "progress",
  library: "exercises",
  workouts: "workouts",
  vacations: "vacations",
  prefs: "settings",
  keys: "keys",
};

export const SECTION_EMOJI: Record<SectionId, string> = {
  library: "🏋️",
  progress: "📈",
  workouts: "📅",
  vacations: "🌴",
  prefs: "⚙️",
  keys: "🔑",
};

export interface SingleFile {
  app: "pulse";
  version: 2;
  section: SectionId;
  exportedAt: string;
  data: Partial<AppState>;
}

export function fileNameFor(id: SectionId, day = new Date().toISOString().slice(0, 10)) {
  return `pulse-${FILE_SLUG[id]}-${day}.json`;
}

/** Builds one clean JSON file for exactly one section. */
export function buildSingleFile(id: SectionId): SingleFile {
  const s = useApp.getState();
  const data = Object.fromEntries(SECTIONS[id].keys.map((k) => [k, s[k]])) as Partial<AppState>;
  return { app: "pulse", version: 2, section: id, exportedAt: new Date().toISOString(), data };
}

/** Human-readable record count for the confirm dialog. */
export function countRecords(
  id: SectionId,
  data: Partial<AppState>,
): { count: number; label: string } {
  switch (id) {
    case "library":
      return { count: data.exercises?.length ?? 0, label: "упражнений" };
    case "progress":
      return { count: data.sessions?.length ?? 0, label: "тренировок в истории" };
    case "workouts": {
      const w = data.workouts?.length ?? 0;
      const steps = data.plan?.steps.length ?? 0;
      return { count: w, label: `тренировок · шагов в плане: ${steps}` };
    }
    case "vacations":
      return { count: data.vacations?.length ?? 0, label: "отпусков" };
    case "prefs": {
      const n = [data.name, data.reminders ? "r" : "", data.voice ? "v" : ""].filter(
        Boolean,
      ).length;
      return { count: n, label: "раздела настроек" };
    }
    case "keys": {
      const n = (data.ai?.keys?.length ?? 0) + (data.ffmpegKey ? 1 : 0);
      return { count: n, label: "ключей" };
    }
  }
}

/**
 * Strictly parses ONE section file. Rejects foreign sections with
 * `wrong-section:<actual>` so the UI can explain without touching data.
 * Legacy v1 (flat `data`) and v2 multi-section (`sections`) files are
 * accepted only when they contain exactly the expected section.
 */
export function parseSingleFile(text: string, expected: SectionId): Partial<AppState> {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("not-json");
  }
  if (j?.["app"] !== "pulse") throw new Error("not-pulse");
  // Legacy multi-section container?
  if (!("section" in j) && (j["sections"] || j["data"])) {
    const legacy = parseBackup(text);
    const ids = Object.keys(legacy) as SectionId[];
    if (!legacy[expected] || Object.keys(legacy[expected] ?? {}).length === 0)
      throw new Error(`wrong-section:${ids[0] ?? "unknown"}`);
    if (ids.length > 1)
      throw new Error(`wrong-section:${ids.filter((i) => i !== expected)[0] ?? ids[0]}`);
    return legacy[expected]!;
  }
  if (j["section"] !== expected)
    throw new Error(`wrong-section:${String(j["section"] ?? "unknown")}`);
  if (typeof j["data"] !== "object" || j["data"] === null) throw new Error("bad-shape");
  const data = migrateState(j["data"] as Partial<AppState>, (j["version"] as number) ?? 2);
  // Shape check: every section must bring at least one of its keys.
  const keys = SECTIONS[expected].keys as string[];
  if (!keys.some((k) => k in (data as Record<string, unknown>))) throw new Error("bad-shape");
  return data;
}

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
    for (const id of Object.keys(SECTIONS) as SectionId[])
      if (j.sections[id]) out[id] = migrateState(j.sections[id], 2);
    return out;
  }
  if (j.data) {
    const data = migrateState(j.data, 1) as Record<string, unknown>;
    const out: Partial<Record<SectionId, Partial<AppState>>> = {};
    for (const id of Object.keys(SECTIONS) as SectionId[]) {
      const part = Object.fromEntries(
        SECTIONS[id].keys.filter((k) => k in data).map((k) => [k, data[k]]),
      );
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

export function applyBackup(
  parts: Partial<Record<SectionId, Partial<AppState>>>,
  plan: Partial<Record<SectionId, Strategy>>,
) {
  const s = useApp.getState();
  const patch: Partial<AppState> = {};
  for (const [id, strat] of Object.entries(plan) as [SectionId, Strategy][]) {
    const p = parts[id];
    if (!p) continue;
    if (strat === "replace") {
      for (const k of SECTIONS[id].keys)
        (patch as Record<string, unknown>)[k] = p[k] ?? initialState[k];
      continue;
    }
    if (id === "progress") {
      const sessions = byId(s.sessions, p.sessions).sort((a, b) => a.date.localeCompare(b.date));
      patch.sessions = sessions;
      patch.xp =
        s.xp +
        (p.sessions ?? [])
          .filter((x) => !s.sessions.some((y) => y.id === x.id))
          .reduce((a, x) => a + x.xp, 0);
      if (p.since && (!s.since || p.since < s.since)) patch.since = p.since;
    } else if (id === "library") patch.exercises = byId(s.exercises, p.exercises);
    else if (id === "workouts") {
      patch.workouts = byId(s.workouts, p.workouts);
      // Keep the current plan unless there is none yet.
      const hasSteps = (pl?: Plan) => !!pl && pl.steps.length > 0;
      patch.plan = hasSteps(s.plan) ? s.plan : ((p.plan as Plan | undefined) ?? initialState.plan);
    } else if (id === "vacations") {
      const key = (v: { start: string; end: string }) => v.start + v.end;
      const have = new Set(s.vacations.map(key));
      patch.vacations = [...s.vacations, ...(p.vacations ?? []).filter((v) => !have.has(key(v)))];
    } else {
      for (const k of SECTIONS[id].keys)
        if (p[k] !== undefined && p[k] !== "") (patch as Record<string, unknown>)[k] = p[k];
    }
  }
  s.set(patch);
}
