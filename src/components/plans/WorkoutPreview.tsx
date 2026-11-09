import { useNavigate } from "@tanstack/react-router";
import { AudioLines, Play } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TapButton } from "@/components/game/TapButton";
import { ExerciseFullView } from "@/components/game/ExerciseFullView";
import { ExerciseThumb } from "@/components/game/ExerciseThumb";
import { useApp } from "@/lib/store";
import { cycleTime, formatSec } from "@/lib/rhythm";
import type { Workout } from "@/lib/types";
import { estimateMinutes } from "@/lib/workout-utils";

/** One entry of the workout preview: thumb · name · target prescribed · rest/rhythm. */
function PreviewRow({
  nth,
  exerciseId,
  sets,
  reps,
  seconds,
  rest,
  bpm,
  rhythm,
  onDetails,
}: {
  nth: number;
  exerciseId: string;
  sets: number;
  reps: number;
  seconds: number;
  rest: number;
  bpm?: number | undefined;
  rhythm?: number[] | undefined;
  onDetails: () => void;
}) {
  const { exercises } = useApp();
  const ex = exercises.find((e) => e.id === exerciseId);
  if (!ex)
    return (
      <li className="rounded-2xl border-2 border-dashed border-border p-3 text-sm text-muted-foreground">
        №{nth} · Упражнение удалено
      </li>
    );
  return (
    <li className="flex items-center gap-3 rounded-2xl border-2 bg-card p-2.5">
      <button
        onClick={onDetails}
        className="press flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-2"
        aria-label={`Подробнее об упражнении ${ex.name}`}
      >
        <ExerciseThumb ex={ex} className="h-12 w-12" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">
            {nth}. {ex.name}
          </span>
          <span className="block text-xs text-muted-foreground">
            {sets} × {ex.mode === "time" ? `${seconds} сек` : `${reps} повт.`} · отдых {rest} сек
          </span>
          {(rhythm ?? ex.rhythm) && !bpm && (
            <span className="block text-xs text-muted-foreground">
              <AudioLines className="mr-1 inline h-3 w-3" aria-hidden />
              ритм {formatSec(cycleTime(rhythm ?? ex.rhythm!))}
            </span>
          )}
          <span className="block text-xs text-muted-foreground">{ex.description}</span>
        </span>
      </button>
    </li>
  );
}

/** Read-only preview of a workout from the plan cycle: what to do, in what order. */
export function WorkoutPreview({
  workout,
  onClose,
}: {
  workout: Workout | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [details, setDetails] = useState<string | null>(null);
  const { exercises } = useApp();
  if (!workout) return null;
  const detailsEx = exercises.find((e) => e.id === details) ?? null;

  return (
    <>
      <Dialog open={!!workout} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-left">
              <span aria-hidden className="text-2xl">
                {workout.emoji}
              </span>
              {workout.name}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {workout.items.length} упр. · ~{estimateMinutes(workout, exercises)} мин
          </p>
          <ul className="space-y-2">
            {workout.items.map((it, i) => (
              <PreviewRow
                key={`${i}-${it.exerciseId}`}
                nth={i + 1}
                onDetails={() => setDetails(it.exerciseId)}
                {...it}
              />
            ))}
          </ul>
          <TapButton
            variant="primary"
            onClick={() => {
              onClose();
              navigate({ to: "/play/$workoutId", params: { workoutId: workout.id } });
            }}
          >
            <Play className="h-4 w-4 fill-current" /> Начать тренировку
          </TapButton>
        </DialogContent>
      </Dialog>
      <ExerciseFullView
        ex={detailsEx}
        open={details !== null}
        onOpenChange={(o) => !o && setDetails(null)}
      />
    </>
  );
}
