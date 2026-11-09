import { Eye } from "lucide-react";
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
  onPreview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (ex: Exercise) => void;
  /** Optional per-row "view before adding" action (opens the full exercise view). */
  onPreview?: ((ex: Exercise) => void) | undefined;
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
              <li key={e.id} className="flex items-center gap-1 rounded-xl hover:bg-muted">
                <button
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm"
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
                {onPreview && (
                  <button
                    onClick={() => onPreview(e)}
                    aria-label={`Просмотреть упражнение ${e.name}`}
                    title="Просмотреть перед добавлением"
                    className="press mr-2 shrink-0 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
