import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExerciseThumb } from "@/components/game/ExerciseThumb";
import { useApp } from "@/lib/store";
import type { Exercise } from "@/lib/types";

/** Search-and-pick dialog over the user's exercise library. */
export function ExercisePicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (ex: Exercise) => void;
}) {
  const exercises = useApp((s) => s.exercises);
  const [q, setQ] = useState("");
  const found = exercises.filter((e) =>
    `${e.name} ${e.muscles.join(" ")}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Добавить упражнение</DialogTitle>
        </DialogHeader>
        <input
          autoFocus
          className="w-full rounded-xl bg-muted px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
          placeholder="Поиск упражнения"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {found.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Ничего не нашлось — попробуй другое слово или напиши упражнение через Адаптацию ИИ.
          </p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {found.map((e) => (
              <li key={e.id}>
                <button
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    onPick(e);
                    onOpenChange(false);
                  }}
                >
                  <ExerciseThumb ex={e} className="h-10 w-10" />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {e.emoji} {e.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {e.mode === "time" ? `${e.seconds} сек` : `${e.reps} повт.`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
