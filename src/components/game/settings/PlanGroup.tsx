import { Input } from "@/components/ui/input";
import type { PlanSettings } from "@/lib/plan";
import { sliceChanged } from "@/lib/settings-draft";
import { SectionCard } from "./SectionCard";
import { useSettingsDraft } from "./draft-context";

type PlanSettingsKey = keyof PlanSettings;

/** Moved in from the /plans tab: x / n / y / недельный порог; drafts until saved. */
export function PlanGroup() {
  const { draft, entry, updatePlanSettings } = useSettingsDraft();
  const st = draft.planSettings;
  const changed = sliceChanged(st, entry.planSettings);
  const rows: { key: PlanSettingsKey; label: string; hint: string; min: number; max: number }[] = [
    {
      key: "bonusMax",
      label: "Максимум доп-выходных (x)",
      hint: "Сколько может лежать про запас.",
      min: 0,
      max: 20,
    },
    {
      key: "bonusRestoreDays",
      label: "Восстановление доп-выходного (n)",
      hint: "Через сколько дней трата возвращается.",
      min: 1,
      max: 30,
    },
    {
      key: "freezeMax",
      label: "Максимум заморозок (y)",
      hint: "Добываются за неделю ≥ порога.",
      min: 0,
      max: 20,
    },
    {
      key: "freezeThresholdPct",
      label: "Порог недели, %",
      hint: "Квесты или тренировки ≥ — получишь заморозку.",
      min: 0,
      max: 100,
    },
  ];
  return (
    <SectionCard
      title="План и серия"
      hint="Пропущенный 1-й и 2-й день тратят доп-выходной, с 3-го — заморозки. Отдых и отпуск — безопасны."
      changed={changed}
    >
      {rows.map(({ key, label, hint, min, max }) => (
        <label key={key} className="flex items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{label}</span>
            <span className="block text-xs text-muted-foreground">{hint}</span>
          </span>
          <Input
            type="number"
            className="w-20 rounded-xl border-2 text-center tabular"
            min={min}
            max={max}
            value={st[key]}
            onChange={(e) => {
              const v = Math.min(max, Math.max(min, Number(e.target.value) || 0));
              updatePlanSettings({ [key]: v });
            }}
          />
        </label>
      ))}
    </SectionCard>
  );
}
