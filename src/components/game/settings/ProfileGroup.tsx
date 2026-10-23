import { sliceChanged } from "@/lib/settings-draft";
import { SectionCard, field } from "./SectionCard";
import { useSettingsDraft } from "./draft-context";
import { VacationButton } from "@/components/game/VacationButton";

/** Name + vacation mode (same dialog as the header button). */
export function ProfileGroup() {
  const { draft, entry, update } = useSettingsDraft();
  const changed = sliceChanged({ name: draft.name }, { name: entry.name });
  return (
    <SectionCard
      title="Профиль"
      hint="Имя видно на профиле и в подсказках Огонёка."
      defaultOpen
      changed={changed}
    >
      <input
        className={field}
        placeholder="Как тебя зовут?"
        value={draft.name}
        onChange={(e) => update({ name: e.target.value })}
        aria-label="Имя"
      />
      <div className="flex items-center justify-between border-t border-border pt-3">
        <div>
          <p>Отпуск</p>
          <p className="text-xs text-muted-foreground">Серия замирает, напоминания пауза</p>
        </div>
        <VacationButton />
      </div>
    </SectionCard>
  );
}
