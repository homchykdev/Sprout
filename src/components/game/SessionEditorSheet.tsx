import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, Plus, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ExerciseFullView } from "@/components/game/ExerciseFullView";
import { ExercisePicker } from "@/components/game/ExercisePicker";
import { ExerciseThumb } from "@/components/game/ExerciseThumb";
import { TapButton } from "@/components/game/TapButton";
import { addItem, itemFromExercise, moveItem, removeItem, updateItem } from "@/lib/session";
import { useApp } from "@/lib/store";
import type { Exercise, WorkoutItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const num =
  "w-14 min-w-0 rounded-xl border-2 bg-card px-2 py-1 text-center text-sm tabular outline-none focus:border-primary";

/**
 * Editable list of the session's exercises, opened from the progress-bar tap.
 * Edits affect only the running session (the parent snapshot) — after the workout
 * completes the parent offers to write them into the stored workout.
 */
export function SessionEditorSheet({
  open,
  onOpenChange,
  items,
  currentItemIndex,
  onDetails,
  onChange,
  onGoTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: WorkoutItem[];
  /** Item the session is on right now — everything before it is already done. */
  currentItemIndex: number;
  onDetails: (ex: Exercise) => void;
  onChange: (items: WorkoutItem[]) => void;
  onGoTo?: ((itemIndex: number) => void) | undefined;
}) {
  const exercises = useApp((s) => s.exercises);
  const [pick, setPick] = useState(false);
  const [details, setDetails] = useState<Exercise | null>(null);
  const exOf = (i: number) => {
    const id = items[i]?.exerciseId;
    const ex = exercises.find((e) => e.id === id);
    return ex;
  };
  const edit = (i: number, patch: Partial<WorkoutItem>) => onChange(updateItem(items, i, patch));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[85dvh] max-w-xl overflow-y-auto rounded-t-3xl px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3"
      >
        <SheetHeader className="text-left">
          <SheetTitle>Состав тренировки</SheetTitle>
          <SheetDescription>
            Правки касаются этой сессии. После тренировки предложим сохранить их в тренировку.
          </SheetDescription>
        </SheetHeader>

        {items.length === 0 && (
          <p className="rounded-2xl border-2 border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            В сессии не осталось упражнений — добавь снизу или закрой тренировку.
          </p>
        )}

        <ul className="mt-4 space-y-2">
          {items.map((it, i) => {
            const ex = exOf(i);
            const done = i < currentItemIndex;
            return (
              <li
                key={`${i}-${it.exerciseId}`}
                className={cn("rounded-2xl border-2 bg-card p-3", done && "opacity-55")}
              >
                <div className="flex items-center gap-2">
                  {ex ? (
                    <button
                      onClick={() => setDetails(ex)}
                      className="press flex min-w-0 flex-1 items-center gap-2 text-left"
                      aria-label={`Подробнее об упражнении ${ex.name}`}
                    >
                      <ExerciseThumb ex={ex} className="h-10 w-10" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {ex.emoji} {ex.name}
                        </span>
                      </span>
                    </button>
                  ) : (
                    <span className="flex-1 truncate text-sm font-semibold text-destructive">
                      Упражнение удалено
                    </span>
                  )}
                  {i === currentItemIndex ? (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                      Сейчас
                    </span>
                  ) : (
                    <Eye className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <button
                    disabled={i === 0}
                    aria-label="Выше"
                    className="press p-1 text-muted-foreground disabled:opacity-30"
                    onClick={() => onChange(moveItem(items, i, i - 1))}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    disabled={i === items.length - 1}
                    aria-label="Ниже"
                    className="press p-1 text-muted-foreground disabled:opacity-30"
                    onClick={() => onChange(moveItem(items, i, i + 1))}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    aria-label="Убрать из сессии"
                    className="press rounded-full p-1 text-muted-foreground hover:text-destructive"
                    onClick={() => onChange(removeItem(items, i))}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {ex && (
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <label className="flex items-center gap-1">
                      Подходы
                      <input
                        type="number"
                        min={1}
                        max={99}
                        className={num}
                        value={it.sets}
                        onChange={(e) => edit(i, { sets: e.target.valueAsNumber })}
                      />
                    </label>
                    {ex.mode === "time" ? (
                      <label className="flex items-center gap-1">
                        Сек
                        <input
                          type="number"
                          min={5}
                          max={600}
                          className={num}
                          value={it.seconds}
                          onChange={(e) => edit(i, { seconds: e.target.valueAsNumber })}
                        />
                      </label>
                    ) : (
                      <label className="flex items-center gap-1">
                        Повт.
                        <input
                          type="number"
                          min={1}
                          max={200}
                          className={num}
                          value={it.reps}
                          onChange={(e) => edit(i, { reps: e.target.valueAsNumber })}
                        />
                      </label>
                    )}
                    <label className="flex items-center gap-1">
                      Отдых
                      <input
                        type="number"
                        min={0}
                        max={600}
                        className={num}
                        value={it.rest}
                        onChange={(e) => edit(i, { rest: e.target.valueAsNumber })}
                      />
                    </label>
                    {onGoTo && !done && i !== currentItemIndex && (
                      <TapButton
                        variant="soft"
                        size="sm"
                        className="ml-auto min-h-[36px] px-3"
                        onClick={() => {
                          onGoTo(i);
                          onOpenChange(false);
                        }}
                      >
                        Начать отсюда
                      </TapButton>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-4">
          <TapButton variant="soft" className="w-full" onClick={() => setPick(true)}>
            <Plus className="h-4 w-4" /> Добавить упражнение
          </TapButton>
          <TapButton
            size="sm"
            variant="ghost"
            className="mt-3 w-full min-h-[44px] rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            Продолжить тренировку
          </TapButton>
        </div>
      </SheetContent>

      <ExercisePicker
        open={pick}
        onOpenChange={setPick}
        onPick={(ex) => onChange(addItem(items, itemFromExercise(ex)))}
      />
      <ExerciseFullView
        ex={details}
        open={!!details}
        onOpenChange={(o) => {
          if (!o) setDetails(null);
        }}
      />
    </Sheet>
  );
}
