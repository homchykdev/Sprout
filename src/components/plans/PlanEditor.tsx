import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { Fragment, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TapButton } from "@/components/game/TapButton";
import { estimateMinutes } from "@/lib/workout-utils";
import { uid, useApp } from "@/lib/store";
import type { PlanStep } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PlanStepRow } from "./PlanStepRow";
import { StepInsertSheet } from "./StepInsertSheet";
import { WorkoutPreview } from "./WorkoutPreview";

/** Thin tappable divider between cycle rows: tap "+", the sheet inserts here. */
function InsertZone({ onInsert, hidden }: { onInsert: () => void; hidden: boolean }) {
  return (
    <button
      onClick={onInsert}
      aria-label="Добавить шаг в это место"
      className={cn(
        "group/iz flex h-8 w-full shrink-0 items-center gap-3 px-3 text-muted-foreground/35 transition-colors hover:text-primary focus-visible:text-primary",
        hidden && "hidden",
      )}
    >
      <span className="h-px flex-1 border-t border-dashed border-border transition-colors group-hover/iz:border-primary/50" />
      <span className="flex h-6 w-6 items-center justify-center rounded-full">
        <Plus className="h-3.5 w-3.5" />
      </span>
      <span className="h-px flex-1 border-t border-dashed border-border transition-colors group-hover/iz:border-primary/50" />
    </button>
  );
}

/**
 * Editable plan cycle: drag & drop reorder (dnd-kit, handle grip),
 * insert zones between every pair of rows, delete with confirmation.
 */
export function PlanEditor() {
  const s = useApp();
  const steps = s.plan.steps;
  const [insertAfter, setInsertAfter] = useState<number | null>(null);
  /** Step id whose place is being filled after its workout was removed/unavailable. */
  const [replaceId, setReplaceId] = useState<string | null>(null);
  /** Step id whose workout preview dialog is open. */
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const pending = steps.find((x) => x.id === deleteId) ?? null;
  const pendingTitle = pending
    ? pending.kind === "rest"
      ? "день отдыха"
      : (s.workouts.find((w) => w.id === pending.workoutId)?.name ?? "нет тренировки")
    : "";
  const recents = recentIds
    .map((id) => s.workouts.find((w) => w.id === id))
    .filter((w) => w !== undefined)
    .slice(0, 4);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(false);
    if (!over) return;
    const from = steps.findIndex((x) => x.id === active.id);
    const to = steps.findIndex((x) => x.id === over.id);
    if (from < 0 || to < 0 || from === to) return;
    s.reorderPlanStep(from, to);
  };

  /** Adds a step at the spot chosen in the sheet. With replaceId active it first
   *  removes the unavailable step, then inserts on its place (position-label "вместо №N"). */
  const addStep = (step: PlanStep) => {
    const replaceIdx = replaceId ? steps.findIndex((x) => x.id === replaceId) : -1;
    if (replaceIdx >= 0 && replaceId) s.removePlanStep(replaceId);
    s.addPlanStep(replaceIdx >= 0 ? replaceIdx - 1 : (insertAfter ?? steps.length - 1), step);
    if (step.kind === "workout" && step.workoutId)
      setRecentIds((ids) => [step.workoutId!, ...ids.filter((id) => id !== step.workoutId)]);
    setInsertAfter(null);
    setReplaceId(null);
  };

  const positionLabel = replaceId
    ? `вместо №${steps.findIndex((x) => x.id === replaceId) + 1}`
    : insertAfter === null
      ? ""
      : insertAfter < 0
        ? "в начало"
        : `после №${insertAfter + 1}`;
  const previewStep = previewId ? (steps.find((x) => x.id === previewId) ?? null) : null;
  const previewWorkout =
    previewStep?.kind === "workout" && previewStep.workoutId
      ? (s.workouts.find((w) => w.id === previewStep.workoutId) ?? null)
      : null;

  if (!steps.length)
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border py-10 text-center">
        <p className="max-w-56 text-sm font-semibold">
          Цикл пуст. Добавь тренировки и дни отдыха — они повторяются бесконечно.
        </p>
        <TapButton variant="primary" onClick={() => setInsertAfter(-1)}>
          <Plus className="h-4 w-4" /> Добавить первый шаг
        </TapButton>
        <StepInsertSheet
          open={insertAfter !== null || replaceId !== null}
          positionLabel={positionLabel}
          recents={[]}
          onClose={() => {
            setInsertAfter(null);
            setReplaceId(null);
          }}
          onPickRest={() => addStep({ id: `step-${uid()}`, kind: "rest" })}
          onPickWorkout={(w) => addStep({ id: `step-${uid()}`, kind: "workout", workoutId: w.id })}
        />
      </div>
    );

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => setDragging(true)}
        onDragCancel={() => setDragging(false)}
        onDragEnd={onDragEnd}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "На ручке шага нажми Enter или Space и используй стрелки, чтобы переставить его.",
          },
          announcements: {
            onDragStart: ({ active }) =>
              `Захвачен шаг №${steps.findIndex((x) => x.id === active.id) + 1}.`,
            onDragOver: ({ active, over }) =>
              over
                ? `Шаг №${steps.findIndex((x) => x.id === active.id) + 1} отпущен на позицию №${steps.findIndex((x) => x.id === over.id) + 1}.`
                : "",
            onDragEnd: () => "Перестановка завершена.",
            onDragCancel: () => "Перетаскивание отменено.",
          },
        }}
      >
        <SortableContext items={steps} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col">
            {steps.map((step, i) => {
              const w = s.workouts.find((x) => x.id === step.workoutId);
              return (
                <Fragment key={step.id}>
                  <InsertZone onInsert={() => setInsertAfter(i - 1)} hidden={dragging} />
                  <PlanStepRow
                    step={step}
                    emoji={w?.emoji ?? "❓"}
                    title={step.kind === "rest" ? "День отдыха" : (w?.name ?? "Нет тренировки")}
                    detail={
                      step.kind === "rest"
                        ? "Восстановление"
                        : w
                          ? `${w.items.length} упр. · ~${estimateMinutes(w, s.exercises)} мин`
                          : "Тренировка удалена — тапни, чтобы заменить"
                    }
                    missing={step.kind === "workout" && !w}
                    position={i + 1}
                    onDelete={() => setDeleteId(step.id)}
                    onOpen={
                      step.kind === "workout"
                        ? w
                          ? () => setPreviewId(step.id)
                          : () => setReplaceId(step.id)
                        : undefined
                    }
                  />
                </Fragment>
              );
            })}
            <InsertZone onInsert={() => setInsertAfter(steps.length - 1)} hidden={dragging} />
          </div>
        </SortableContext>
      </DndContext>
      <p className="mt-3 text-xs text-muted-foreground">
        Перетаскивай шаги за ручку, тапай «+» между строками, чтобы вставить в это место, или тапни
        по шагу — покажу всё, что в нём делать.
      </p>
      <StepInsertSheet
        open={insertAfter !== null || replaceId !== null}
        positionLabel={positionLabel}
        recents={recents}
        onClose={() => {
          setInsertAfter(null);
          setReplaceId(null);
        }}
        onPickRest={() => addStep({ id: `step-${uid()}`, kind: "rest" })}
        onPickWorkout={(w) => addStep({ id: `step-${uid()}`, kind: "workout", workoutId: w.id })}
      />
      <WorkoutPreview workout={previewWorkout} onClose={() => setPreviewId(null)} />
      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="rounded-3xl sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Убрать шаг из плана?</AlertDialogTitle>
            <AlertDialogDescription>
              «{pendingTitle}» исчезнет из цикла. Сама тренировка останется в библиотеке.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-2xl">Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pending) s.removePlanStep(pending.id);
                setDeleteId(null);
              }}
            >
              Убрать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
