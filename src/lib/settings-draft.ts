import type { AppState, VoiceSettings } from "./store";
import type { PlanSettings } from "./plan";
import type { PhotoReminderSettings } from "./photo-reminders";
import type { ReminderSettings } from "./phrases";
import type { AiSettings } from "./types";

/** The subset of app state the settings page edits as a draft (before a save by the user). */
export interface SettingsDraft {
  name: string;
  reminders: ReminderSettings;
  photoReminder: PhotoReminderSettings;
  voice: VoiceSettings;
  ai: AiSettings;
  /** Protection settings only — the plan cycle itself is edited on the /plans tab. */
  planSettings: PlanSettings;
  ffmpegKey: string;
  ffmpegOptions: string[];
  ffmpegOut: string;
}

/** Creates the draft snapshot from the current store state. */
export function pickDraft(s: AppState): SettingsDraft {
  return {
    name: s.name,
    reminders: { ...s.reminders },
    photoReminder: { ...s.photoReminder },
    voice: { ...s.voice },
    ai: { ...s.ai },
    planSettings: { ...s.plan.settings },
    ffmpegKey: s.ffmpegKey,
    ffmpegOptions: [...s.ffmpegOptions],
    ffmpegOut: s.ffmpegOut,
  };
}

/** Converts the draft into a store patch; keeps the current plan cycle (steps/origin) intact. */
export function draftToState(d: SettingsDraft, plan: AppState["plan"]): Partial<AppState> {
  return {
    name: d.name,
    reminders: { ...d.reminders },
    photoReminder: { ...d.photoReminder },
    voice: { ...d.voice },
    ai: { ...d.ai },
    plan: { ...plan, settings: { ...d.planSettings } },
    ffmpegKey: d.ffmpegKey,
    ffmpegOptions: [...d.ffmpegOptions],
    ffmpegOut: d.ffmpegOut,
  };
}

function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => eq(x, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    return ka.length === kb.length && ka.every((k) => eq((a as never)[k], (b as never)[k]));
  }
  return false;
}

/** True when at least one setting differs between the draft and the baseline snapshot. */
export function isDraftDirty(a: SettingsDraft, b: SettingsDraft): boolean {
  return !eq(a, b);
}

/** Structural comparison of a single group slice (weakly typed on purpose — see groups). */
export function sliceChanged(a: unknown, b: unknown): boolean {
  return !eq(a, b);
}
