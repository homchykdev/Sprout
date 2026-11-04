import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useApp } from "@/lib/store";
import type { Workout } from "@/lib/types";
import { estimateMinutes } from "@/lib/workout-utils";

export interface StepInsertSheetProps {
  open: boolean;
  /** Where the step will be inserted, e.g. "в начало" or "после №2". */
  positionLabel: string;
  /** Last used workouts (fresh first) shown as quick chips. */
  recents: Workout[];
  onClose: () => void;
  onPickRest: () => void;
  onPickWorkout: (workout: Workout) => void;
}

/**
 * Bottom sheet for inserting a plan step at a specific spot: quick chips
 * (rest day + recently used) on top, searchable workout list below.
 */
export function StepInsertSheet({
  open,
  positionLabel,
  recents,
  onClose,
  onPickRest,
  onPickWorkout,
}: StepInsertSheetProps) {
  const s = useApp();
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);
  const q = query.trim().toLowerCase();
  const found = s.workouts.filter((w) => w.name.toLowerCase().includes(q));
  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="mx-auto max-w-lg rounded-t-3xl">
        <DrawerHeader className="pb-2 text-center">
          <DrawerTitle>Добавить шаг · {positionLabel}</DrawerTitle>
          <DrawerDescription className="sr-only">
            Выбери тренировку или день отдыха для вставки в цикл.
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-6">
          <label className="sr-only" htmlFor="plan-step-search">
            Поиск тренировки
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="plan-step-search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск тренировки…"
              className="h-11 w-full rounded-2xl border-2 bg-card pl-11 pr-4 outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={onPickRest}
              className="flex shrink-0 items-center gap-1.5 rounded-full border-2 bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted"
            >
              🛏 День отдыха
            </button>
            {recents.map((w) => (
              <button
                key={w.id}
                onClick={() => onPickWorkout(w)}
                className="flex shrink-0 items-center gap-1.5 rounded-full border-2 border-primary/30 bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted"
              >
                <span aria-hidden>{w.emoji}</span> {w.name}
              </button>
            ))}
          </div>
          <div className="mt-2 max-h-[45dvh] min-h-20 space-y-1 overflow-y-auto">
            {found.map((w) => (
              <button
                key={w.id}
                aria-label={`Добавить ${w.name}`}
                onClick={() => onPickWorkout(w)}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-muted"
              >
                <span className="text-xl" aria-hidden>
                  {w.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{w.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {w.items.length} упр. · ~{estimateMinutes(w, s.exercises)} мин
                  </span>
                </span>
              </button>
            ))}
            {found.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Ничего не найдено. Создай тренировку на вкладке «Мои тренировки».
              </p>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
