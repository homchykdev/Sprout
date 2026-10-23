import { createContext, useContext } from "react";
import type { AiSettings } from "@/lib/types";
import type { PlanSettings } from "@/lib/plan";
import type { SettingsDraft } from "@/lib/settings-draft";
import type { VoiceSettings } from "@/lib/store";

/** Mutable settings draft: controls edit the snapshot, the store only on an explicit save. */
export interface SettingsDraftApi {
  draft: SettingsDraft;
  dirty: boolean;
  update: (patch: Partial<SettingsDraft>) => void;
  updateVoice: (patch: Partial<VoiceSettings>) => void;
  updateAi: (patch: Partial<AiSettings>) => void;
  updatePlanSettings: (patch: Partial<PlanSettings>) => void;
  /** Persists the draft to the store. */
  save: () => void;
  /** Rolls the draft back to the last saved state. */
  discard: () => void;
}

export const SettingsDraftContext = createContext<SettingsDraftApi | null>(null);

export function useSettingsDraft(): SettingsDraftApi {
  const ctx = useContext(SettingsDraftContext);
  if (!ctx) throw new Error("useSettingsDraft requires SettingsDraftProvider");
  return ctx;
}
