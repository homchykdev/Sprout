import { useRef, useState, type ReactNode } from "react";
import { draftToState, isDraftDirty, pickDraft, type SettingsDraft } from "@/lib/settings-draft";
import type { AiSettings } from "@/lib/types";
import type { PlanSettings } from "@/lib/plan";
import { useApp, type VoiceSettings, type WorkoutSettings } from "@/lib/store";
import { SettingsDraftContext } from "./draft-context";

/** Snapshot provider: edits live in local state, the store changes only via save(). */
export function SettingsDraftProvider({ children }: { children: ReactNode }) {
  // The baseline is the store as the user entered the page; dirty is measured against it.
  const baseline = useRef<SettingsDraft>(pickDraft(useApp.getState()));
  const [draft, setDraft] = useState<SettingsDraft>(baseline.current);

  const update = (patch: Partial<SettingsDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const updateVoice = (patch: Partial<VoiceSettings>) =>
    setDraft((d) => ({ ...d, voice: { ...d.voice, ...patch } }));
  const updateWorkoutSettings = (patch: Partial<WorkoutSettings>) =>
    setDraft((d) => ({ ...d, workoutSettings: { ...d.workoutSettings, ...patch } }));
  const updateAi = (patch: Partial<AiSettings>) =>
    setDraft((d) => ({ ...d, ai: { ...d.ai, ...patch } }));
  const updatePlanSettings = (patch: Partial<PlanSettings>) =>
    setDraft((d) => ({ ...d, planSettings: { ...d.planSettings, ...patch } }));

  const dirty = isDraftDirty(draft, baseline.current);

  const save = () => {
    const s = useApp.getState();
    s.set(draftToState(draft, s.plan));
    baseline.current = draft;
    // New identity forces a re-render so `dirty` re-computes against the new baseline.
    setDraft((d) => ({ ...d }));
  };

  const discard = () => setDraft(baseline.current);

  return (
    <SettingsDraftContext.Provider
      value={{
        draft,
        entry: baseline.current,
        dirty,
        update,
        updateVoice,
        updateWorkoutSettings,
        updateAi,
        updatePlanSettings,
        save,
        discard,
      }}
    >
      {children}
    </SettingsDraftContext.Provider>
  );
}
