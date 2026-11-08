import { useSettingsDraft } from "./draft-context";
import { sliceChanged } from "@/lib/settings-draft";
import { SectionCard } from "./SectionCard";

/** Session execution: the readiness countdown shown before the very first exercise. */
export function WorkoutGroup() {
  const { draft, entry, updateWorkoutSettings } = useSettingsDraft();
  const w = draft.workoutSettings;
  const changed = sliceChanged(w, entry.workoutSettings);

  return (
    <SectionCard title="Тренировка" changed={changed}>
      <label className="flex items-center justify-between gap-3" htmlFor="prep-seconds">
        <span>
          Таймер перед началом
          <span className="block text-xs text-muted-foreground">
            Пауза перед первым упражнением, чтобы приготовиться: прочитать и услышать.
          </span>
        </span>
        <div className="flex items-center gap-2">
          <input
            id="prep-seconds"
            type="number"
            inputMode="numeric"
            min={0}
            max={30}
            value={w.prepSeconds}
            onChange={(e) => {
              const n = Math.max(0, Math.min(30, Math.round(+e.target.value || 0)));
              updateWorkoutSettings({ prepSeconds: n });
            }}
            className="w-14 rounded-xl border-2 bg-card px-2 py-1 text-center text-sm tabular outline-none focus:border-primary"
          />
          <span className="text-xs font-semibold text-muted-foreground">сек</span>
        </div>
      </label>
      <p className="text-xs text-muted-foreground">0 — отключить таймер.</p>
    </SectionCard>
  );
}
