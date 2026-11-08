import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ExerciseMedia } from "@/components/game/ExerciseMedia";
import type { Exercise } from "@/lib/types";

/**
 * Everything about one exercise: media, description, numbered technique and the frequent
 * mistakes. Displayed in a scrollable dialog while the workout timer is on hold (the parent
 * registers a pause while `open`).
 */
export function ExerciseFullView({
  ex,
  open,
  onOpenChange,
}: {
  ex: Exercise | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!ex) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogTitle className="sr-only">{ex.name}</DialogTitle>
        <ExerciseMedia ex={ex} />
        <div className="-mt-2">
          <h2 className="text-xl font-extrabold tracking-tight">{ex.name}</h2>
          {ex.description && (
            <p className="mt-1 text-[15px] text-muted-foreground">{ex.description}</p>
          )}
        </div>
        {ex.steps.length > 0 && (
          <ol className="space-y-2">
            {ex.steps.map((t, i) => (
              <li key={i} className="flex gap-3 text-[15px]">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-shade">
                  {i + 1}
                </span>
                {t}
              </li>
            ))}
          </ol>
        )}
        {ex.mistakes.length > 0 && (
          <div className="space-y-1.5 rounded-2xl bg-flame-soft p-4">
            {ex.mistakes.map((m, i) => (
              <p key={i} className="flex gap-2 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-flame-shade" />
                {m}
              </p>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
