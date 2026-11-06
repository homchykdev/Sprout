import { BookMarked, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import type { ChatAppRef } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

/**
 * Picks an app entity to attach to the next chat message: an exercise, a
 * workout or the plan cycle. Selection is one-shot — picking closes the panel.
 */
export function AppDataPicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (ref: ChatAppRef) => void;
}) {
  const [query, setQuery] = useState("");
  const exercises = useApp((s) => s.exercises);
  const workouts = useApp((s) => s.workouts);
  const plan = useApp((s) => s.plan);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byName = (name: string) => !q || name.toLowerCase().includes(q);
    const list: ChatAppRef[] = exercises
      .filter((e) => byName(e.name))
      .map((e) => ({
        kind: "exercise" as const,
        id: e.id,
        name: e.name,
        data: JSON.stringify(e),
      }));
    for (const w of workouts.filter((w) => byName(w.name))) {
      list.push({
        kind: "workout",
        id: w.id,
        name: w.name,
        data: JSON.stringify({
          id: w.id,
          name: w.name,
          emoji: w.emoji,
          items: w.items.map((i) => {
            const ex = exercises.find((x) => x.id === i.exerciseId);
            return {
              name: ex?.name ?? i.exerciseId,
              sets: i.sets,
              reps: i.reps,
              seconds: i.seconds,
              rest: i.rest,
              bpm: i.bpm,
            };
          }),
        }),
      });
    }
    list.push({
      kind: "plan",
      id: "plan",
      name: "Цикл плана",
      data: JSON.stringify({
        steps: plan.steps.map((st) => ({
          index: plan.steps.indexOf(st),
          kind: st.kind,
          workout: st.workoutId
            ? (workouts.find((w) => w.id === st.workoutId)?.name ?? "?")
            : undefined,
        })),
      }),
    });
    return list;
  }, [query, exercises, workouts, plan]);

  return (
    <div
      className="rounded-2xl border-2 bg-card p-2"
      role="dialog"
      aria-label="Данные из приложения"
    >
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          className="min-h-[40px] flex-1 border-0 bg-transparent text-sm outline-none"
          placeholder="Упражнение, тренировка или план…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          aria-label="Закрыть выбор"
          onClick={onClose}
          className="press flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">
        {items.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">Ничего не найдено</p>
        )}
        {items.slice(0, 30).map((r) => (
          <button
            key={`${r.kind}-${r.id}`}
            type="button"
            onClick={() => {
              onPick(r);
              onClose();
            }}
            className="press min-h-[44px] flex w-full items-center gap-2 rounded-xl px-2 text-left text-sm hover:bg-muted"
          >
            <BookMarked className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate font-semibold">{r.name}</span>
            <span
              className={cn(
                "ml-auto shrink-0 text-[11px] font-bold uppercase tracking-wide text-muted-foreground",
              )}
            >
              {r.kind === "exercise" ? "упр." : r.kind === "workout" ? "тренировка" : "план"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
