import { field } from "@/components/game/settings/SectionCard";
import type { StepProps } from "./types";

/** Step 2: user display name. Optional — can stay empty. */
export function StepName({ draft, update }: StepProps) {
  return (
    <div className="flex flex-1 flex-col gap-3 py-6">
      <input
        autoFocus
        aria-label="Имя пользователя"
        className={field}
        placeholder="Например, Саша"
        value={draft.name}
        onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
      />
      <p className="text-sm text-muted-foreground">
        Так тебя будут приветствовать. Можно пропустить — имя задаётся и позже в разделе «Профиль».
      </p>
    </div>
  );
}
