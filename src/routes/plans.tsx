import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AudioLines,
  ChevronRight,
  GripVertical,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlanEditor } from "@/components/plans/PlanEditor";
import { TapButton } from "@/components/game/TapButton";
import { ExerciseFullView } from "@/components/game/ExerciseFullView";
import { ExerciseThumb } from "@/components/game/ExerciseThumb";
import { FeedbackEditor, cleanFeedback, toParts } from "@/components/game/FeedbackEditor";
import { ExercisePicker } from "@/components/game/ExercisePicker";
import { aiCreateWorkout } from "@/lib/clients";
import { forecast, nextWorkout, planProgress } from "@/lib/plan";
import { useApp, uid } from "@/lib/store";
import { cycleTime, formatSec } from "@/lib/rhythm";
import { type Exercise, type Workout } from "@/lib/types";
import { cn } from "@/lib/utils";
import { estimateMinutes } from "@/lib/workout-utils";
import { TapRhythmRecorder } from "@/components/game/TapRhythmRecorder";
import { LibraryContent } from "./library";

export const Route = createFileRoute("/plans")({
  head: () => ({
    meta: [
      { title: "Тренировки · Пульс" },
      {
        name: "description",
        content: "Составляй тренировки, строй цикл плана и настраивай защиту серии.",
      },
      { property: "og:title", content: "Тренировки · Пульс" },
      { property: "og:description", content: "План-цикл, тренировки и упражнения." },
    ],
  }),
  component: Plans,
});

function Plans() {
  const [tab, setTab] = useState<"plan" | "workouts" | "exercises">("plan");
  return (
    <div className="space-y-5">
      <h1 className="pt-2 text-3xl font-extrabold tracking-tight">Тренировки</h1>
      <div
        className="flex rounded-full bg-muted p-1 text-sm font-semibold"
        role="tablist"
        aria-label="Разделы тренировок"
      >
        {(
          [
            ["plan", "План"],
            ["workouts", "Мои тренировки"],
            ["exercises", "Упражнения"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "min-h-[44px] flex-1 rounded-full transition-colors",
              tab === id ? "bg-card shadow-sm" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "plan" ? (
        <PlanContent />
      ) : tab === "exercises" ? (
        <LibraryContent />
      ) : (
        <PlansContent />
      )}
    </div>
  );
}

/** Ресурсный блок: доп-выходные и заморозки серии. */
function ProtectionBar() {
  const s = useApp();
  const p = planProgress(s);
  const { bonusMax, freezeMax } = s.plan.settings;
  return (
    <div className="card-soft grid grid-cols-3 gap-3 p-4 text-center">
      <div>
        <p className="text-2xl font-extrabold tabular">🔥 {p.streak}</p>
        <p className="text-xs font-semibold text-muted-foreground">дней серии</p>
      </div>
      <div>
        <p className="text-2xl font-extrabold tabular">
          🛏️ {p.bonusLeft}/{bonusMax}
        </p>
        <p className="text-xs font-semibold text-muted-foreground">доп-выходные</p>
      </div>
      <div>
        <p className="text-2xl font-extrabold tabular">
          ❄️ {p.freezeLeft}/{freezeMax}
        </p>
        <p className="text-xs font-semibold text-muted-foreground">заморозки</p>
      </div>
    </div>
  );
}

function PlanContent() {
  const s = useApp();
  const prog = planProgress(s);
  const nx = nextWorkout(s);
  const fc = forecast(s, 30);
  return (
    <div className="space-y-5">
      <ProtectionBar />

      <section className="card-soft p-5">
        <h2 className="font-bold">Цикл плана</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Повторяется от даты старта. Выстроенная последовательность — твой месяц и далее.
        </p>
        <div className="mt-4">
          <PlanEditor />
        </div>
      </section>
      <section className="card-soft p-5">
        <h2 className="font-bold">План на {fc.length} дней</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Как цикл ложится на ближайший месяц: эмодзи — день тренировки, 🛏️ — отдых. Зелёный контур
          — тренировка по плану, цвет заливки — результат дня.
        </p>
        <div className="mt-3 grid grid-cols-10 gap-1.5">
          {fc.map((info) => {
            const w = s.workouts.find((x) => x.id === info.step?.workoutId);
            return (
              <span
                key={info.date.getTime()}
                title={info.date.toLocaleDateString("ru", { day: "numeric", month: "short" })}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-xl text-[10px] font-bold",
                  info.status === "done" && "bg-flame text-primary-foreground",
                  info.status === "pending" && "border-2 border-dashed border-flame",
                  info.status === "future" &&
                    "border-2 border-primary/40 bg-transparent text-primary-shade",
                  info.status === "rest" && "bg-muted text-muted-foreground",
                  info.status === "vacation" && "bg-sky-soft text-sky-shade",
                  (info.status === "off" ||
                    info.status === "missed" ||
                    info.status === "protected") &&
                    "bg-muted text-muted-foreground",
                )}
              >
                {w ? w.emoji : info.status === "rest" ? "🛏️" : info.date.getDate()}
              </span>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-3 rounded bg-flame" /> сделал
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-3 rounded border-2 border-dashed border-flame" />{" "}
            планирует сегодня
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-3 rounded border-2 border-primary/40" /> по плану
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-3 rounded bg-muted" /> отдых · отпуск · пропуск
          </span>
        </div>
      </section>

      <p className="text-sm font-medium">
        {nx ? (
          <>
            Следующий шаг: {nx.workout?.name ?? "нет тренировки"} —{" "}
            {nx.date.toLocaleDateString("ru", { day: "numeric", month: "short" })}
          </>
        ) : (
          "План пуст — добавь шаги цикла."
        )}
      </p>
      <p className="text-xs text-muted-foreground">
        Старт цикла: {new Date(s.plan.origin + "T12:00").toLocaleDateString("ru")}. Заморозки
        возвращает итог недели ≥ {s.plan.settings.freezeThresholdPct}% (квесты или план). Серия
        сейчас: {prog.streak} {prog.breakAt ? `(сломана ${prog.breakAt})` : ""}
      </p>
    </div>
  );
}

function PlansContent() {
  const s = useApp();
  const nav = useNavigate();
  const [edit, setEdit] = useState<Workout | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const nx = nextWorkout(s);
  const planHits = new Map<string, number[]>();
  for (let i = 0; i < s.plan.steps.length; i++) {
    const st = s.plan.steps[i]!;
    if (st.kind === "workout")
      planHits.set(st.workoutId ?? "none", [
        ...(planHits.get(st.workoutId ?? "none") ?? []),
        i + 1,
      ]);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Мои тренировки</h2>
        <div className="flex gap-2">
          <TapButton
            size="sm"
            variant="flame"
            onClick={() =>
              s.ai.keys.length ? setAiOpen(true) : toast("Добавьте ИИ-ключ в Настройках")
            }
          >
            <Sparkles className="h-4 w-4" /> ИИ
          </TapButton>
          <TapButton
            size="sm"
            onClick={() => setEdit({ id: `w-${uid()}`, name: "", emoji: "💪", items: [] })}
          >
            <Plus className="h-4 w-4" /> Новая
          </TapButton>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Тренировку можно использовать в цикле плана — шаги выбирают её сами.
      </p>

      <div className="space-y-2.5">
        {s.workouts.map((w) => {
          const hits = planHits.get(w.id) ?? [];
          return (
            <div
              key={w.id}
              className={cn("card-soft p-4", nx?.workout?.id === w.id && "ring-2 ring-primary")}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{w.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {w.name}
                    {nx?.workout?.id === w.id && (
                      <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-primary-shade">
                        СЛЕДУЮЩАЯ
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {w.items.length} упр. · ~{estimateMinutes(w, s.exercises)} мин
                    {w.feedback?.difficulty ? ` · ${w.feedback.difficulty}/10` : ""}
                    {w.feedback?.verdict ? ` · ${w.feedback.verdict === "like" ? "👍" : "👎"}` : ""}
                  </p>
                </div>
                <button
                  className="rounded-full p-2 text-muted-foreground hover:bg-muted"
                  onClick={() => setEdit(w)}
                  aria-label="Изменить"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <TapButton
                  size="icon"
                  onClick={() => nav({ to: "/play/$workoutId", params: { workoutId: w.id } })}
                  aria-label="Начать"
                >
                  <Play className="h-4 w-4 fill-current" />
                </TapButton>
              </div>
              {hits.length > 0 && (
                <p className="mt-2 rounded-xl bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                  В плане: {hits.map((i) => `№${i}`).join(", ")}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <WorkoutEditor value={edit} onClose={() => setEdit(null)} />
      <AiWorkout
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onDone={(w) => {
          setAiOpen(false);
          setEdit(w);
        }}
      />
    </div>
  );
}

/** Dnd-kit wrapper: makes its children sortable by id ("i:exerciseId"). */
function SortableRow({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  const { setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(className, isDragging && "relative z-10 shadow-lg")}
    >
      {children}
    </div>
  );
}

/** Drag handle of one workout item (the only element with the sortable listeners). */
function ItemGrip({ id, position }: { id: string; position: number }) {
  const { attributes, listeners, setActivatorNodeRef } = useSortable({ id });
  return (
    <button
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Перетащить упражнение ${position}`}
      className="press -ml-1 flex h-11 w-7 shrink-0 touch-none items-center justify-center text-muted-foreground/70 hover:text-foreground focus-visible:text-foreground focus-visible:outline-2"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}

function WorkoutEditor({ value, onClose }: { value: Workout | null; onClose: () => void }) {
  const { exercises, upsertWorkout, deleteWorkout, workouts } = useApp();
  const [w, setW] = useState<Workout | null>(value);
  const [pick, setPick] = useState(false);
  /** Exercise opened for preview from the add-exercise picker (not yet added). */
  const [pickerDetails, setPickerDetails] = useState<Exercise | null>(null);
  /** Item index whose rhythm override is being recorded in the dialog. */
  const [rhythmFor, setRhythmFor] = useState<number | null>(null);
  /** Exercise whose full preview (media, technique) is open. */
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  if (value && w?.id !== value.id) setW(value);
  if (!w || !value) return null;
  const items = w.items;
  const setItems = (x: Workout["items"]) => setW({ ...w, items: x });
  const exOf = (i: number) => exercises.find((e) => e.id === items[i]?.exerciseId);
  /** Appends an exercise with default targets (from the picker). */
  const addItem = (e: Exercise) =>
    setItems([
      ...items,
      {
        exerciseId: e.id,
        sets: 3,
        reps: e.reps,
        seconds: e.seconds,
        rest: 45,
        ...(e.bpm ? { bpm: e.bpm } : {}),
      },
    ]);
  /** Stable while dragging: "<index>:<exerciseId>" lets drag end map back to indexes. */
  const ids = items.map((it, i) => `${i}:${it.exerciseId}`);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = Number(String(active.id).split(":")[0]);
    const to = Number(String(over.id).split(":")[0]);
    setItems(arrayMove(items, from, to));
  };
  const num =
    "w-14 rounded-xl border-2 bg-card px-2 py-1 text-center text-sm tabular outline-none focus:border-primary";

  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{value.name ? "Тренировка" : "Новая тренировка"}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <input
            className="w-16 rounded-2xl border-2 px-2 py-3 text-center"
            value={w.emoji}
            onChange={(e) => setW({ ...w, emoji: e.target.value })}
          />
          <input
            className="flex-1 rounded-2xl border-2 px-4 py-3 outline-none focus:border-primary"
            placeholder="Название"
            value={w.name}
            onChange={(e) => setW({ ...w, name: e.target.value })}
          />
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{
            screenReaderInstructions: {
              draggable:
                "На ручке пункта нажми Enter или Space и используй стрелки, чтобы переставить его.",
            },
            announcements: {
              onDragStart: ({ active }) =>
                `Захвачено упражнение №${Number(String(active.id).split(":")[0]) + 1}.`,
              onDragOver: ({ active, over }) =>
                over
                  ? `Упражнение №${Number(String(active.id).split(":")[0]) + 1} над позицией №${Number(String(over.id).split(":")[0]) + 1}.`
                  : "",
              onDragEnd: () => "Перестановка завершена.",
              onDragCancel: () => "Перетаскивание отменено.",
            },
          }}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {items.map((it, i) => {
                const ex = exercises.find((e) => e.id === it.exerciseId);
                const id = `${i}:${it.exerciseId}`;
                return (
                  <SortableRow key={id} id={id} className="rounded-2xl border-2 p-3">
                    <div className="flex items-center gap-2">
                      <ItemGrip id={id} position={i + 1} />
                      {ex ? (
                        <button
                          onClick={() => setDetailsId(ex.id)}
                          className="press flex min-w-0 flex-1 items-center gap-2 rounded-xl py-1 text-left focus-visible:outline-2"
                          aria-label={`Подробнее об упражнении ${ex.name}`}
                        >
                          <ExerciseThumb ex={ex} className="h-10 w-10" />
                          <span className="min-w-0 flex-1 truncate font-semibold">{ex.name}</span>
                        </button>
                      ) : (
                        <span className="flex-1 truncate text-sm font-semibold text-destructive">
                          Упражнение удалено
                        </span>
                      )}
                      <button
                        onClick={() => setItems(items.filter((_, j) => j !== i))}
                        className="press rounded-full p-2 text-muted-foreground hover:text-destructive"
                        aria-label="Убрать упражнение"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <label className="flex items-center gap-1">
                        Подходы{" "}
                        <input
                          type="number"
                          className={num}
                          value={it.sets}
                          onChange={(e) =>
                            setItems(
                              items.map((x, j) => (j === i ? { ...x, sets: +e.target.value } : x)),
                            )
                          }
                        />
                      </label>
                      {ex?.mode === "time" ? (
                        <label className="flex items-center gap-1">
                          Сек{" "}
                          <input
                            type="number"
                            className={num}
                            value={it.seconds}
                            onChange={(e) =>
                              setItems(
                                items.map((x, j) =>
                                  j === i ? { ...x, seconds: +e.target.value } : x,
                                ),
                              )
                            }
                          />
                        </label>
                      ) : (
                        <label className="flex items-center gap-1">
                          Повт.{" "}
                          <input
                            type="number"
                            className={num}
                            value={it.reps}
                            onChange={(e) =>
                              setItems(
                                items.map((x, j) =>
                                  j === i ? { ...x, reps: +e.target.value } : x,
                                ),
                              )
                            }
                          />
                        </label>
                      )}
                      <label className="flex items-center gap-1">
                        Отдых{" "}
                        <input
                          type="number"
                          className={num}
                          value={it.rest}
                          onChange={(e) =>
                            setItems(
                              items.map((x, j) => (j === i ? { ...x, rest: +e.target.value } : x)),
                            )
                          }
                        />
                      </label>
                      <label
                        className="flex items-center gap-1"
                        title="Темп метронома для этой тренировки. Пусто — рекомендованный темп упражнения."
                      >
                        Темп{" "}
                        <input
                          type="number"
                          className={num}
                          placeholder={ex?.bpm ? `♩${ex.bpm}` : ex?.rhythm?.length ? "♪ ритм" : "—"}
                          value={it.bpm ?? ""}
                          onChange={(e) =>
                            setItems(
                              items.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      bpm: e.target.value
                                        ? Math.min(200, Math.max(20, +e.target.value))
                                        : undefined,
                                      // bpm and tapped rhythm are mutually exclusive.
                                      rhythm: e.target.value ? undefined : x.rhythm,
                                    }
                                  : x,
                              ),
                            )
                          }
                        />
                      </label>
                      {(ex?.rhythm?.length || it.rhythm) && !it.bpm && (
                        <>
                          <button
                            onClick={() => setRhythmFor(i)}
                            title={
                              it.rhythm
                                ? `Свой ритм пункта: цикл ${formatSec(cycleTime(it.rhythm))}`
                                : "Настучать свой ритм для этого пункта (иначе берётся ритм упражнения)"
                            }
                            className={cn(
                              "press flex items-center gap-1 rounded-full border-2 px-2.5 py-1 font-semibold",
                              it.rhythm
                                ? "border-primary bg-primary-soft text-primary-shade"
                                : "border-border text-muted-foreground",
                            )}
                          >
                            <AudioLines className="h-3.5 w-3.5" aria-hidden />
                            {it.rhythm ? `♪ ${formatSec(cycleTime(it.rhythm))}` : "♪ свой ритм"}
                          </button>
                          {it.rhythm && (
                            <button
                              aria-label="Сбросить свой ритм пункта"
                              onClick={() =>
                                setItems(
                                  items.map((x, j) => (j === i ? { ...x, rhythm: undefined } : x)),
                                )
                              }
                              className="press rounded-full p-1 text-muted-foreground"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </SortableRow>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
        <TapButton variant="soft" onClick={() => setPick(true)}>
          <Plus className="h-4 w-4" /> Добавить упражнение
        </TapButton>
        <div>
          <p className="mb-2 text-sm font-semibold text-muted-foreground">
            Моя оценка — учитывается при составлении тренировок от ИИ
          </p>
          <FeedbackEditor
            {...toParts(w.feedback)}
            onChange={(d) => setW({ ...w, feedback: cleanFeedback(w.feedback, { difficulty: d }) })}
            onVerdict={(v) => setW({ ...w, feedback: cleanFeedback(w.feedback, { verdict: v }) })}
          />
        </div>
        <div className="flex gap-2">
          {workouts.some((x) => x.id === w.id) && (
            <TapButton
              variant="danger"
              onClick={() => {
                if (confirm("Удалить тренировку?")) {
                  deleteWorkout(w.id);
                  onClose();
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </TapButton>
          )}
          <TapButton
            className="flex-1"
            disabled={!w.name || !items.length}
            onClick={() => {
              upsertWorkout(w);
              toast.success("Сохранено");
              onClose();
            }}
          >
            Сохранить
          </TapButton>
        </div>
        {rhythmFor !== null && (
          <Dialog open onOpenChange={(o) => !o && setRhythmFor(null)}>
            <DialogContent className="rounded-3xl sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Ритм этого пункта</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                {items[rhythmFor]?.rhythm
                  ? "Свой ритм пункта — звучит вместо ритма упражнения."
                  : exOf(rhythmFor)
                    ? `Пусто — берём ритм упражнения «${exOf(rhythmFor)!.name}»`
                    : "Пусто — берём темп метронома упражнения"}
              </p>
              <TapRhythmRecorder
                value={items[rhythmFor]?.rhythm}
                onChange={(r) =>
                  setItems(items.map((x, j) => (j === rhythmFor ? { ...x, rhythm: r } : x)))
                }
              />
            </DialogContent>
          </Dialog>
        )}
        <ExercisePicker
          open={pick}
          onOpenChange={setPick}
          onPick={addItem}
          onPreview={(ex) => setPickerDetails(ex)}
        />
        <ExerciseFullView
          ex={pickerDetails ?? exercises.find((e) => e.id === detailsId) ?? null}
          open={pickerDetails !== null || detailsId !== null}
          onOpenChange={(o) => {
            if (!o) {
              setPickerDetails(null);
              setDetailsId(null);
            }
          }}
          action={
            pickerDetails ? (
              <TapButton
                variant="primary"
                onClick={() => {
                  addItem(pickerDetails);
                  setPickerDetails(null); // keep the picker open for picking more
                }}
              >
                <Plus className="h-4 w-4" /> Добавить
              </TapButton>
            ) : undefined
          }
        />
      </DialogContent>
    </Dialog>
  );
}

function AiWorkout({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (w: Workout) => void;
}) {
  const exercises = useApp((s) => s.exercises);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>Тренировка от ИИ</DialogTitle>
        </DialogHeader>
        <textarea
          rows={3}
          className="rounded-2xl border-2 p-4 outline-none focus:border-primary"
          placeholder="напр. 25 минут, дома, спина и кор, средний уровень"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <TapButton
          variant="flame"
          disabled={busy || q.length < 3}
          onClick={async () => {
            setBusy(true);
            try {
              onDone(await aiCreateWorkout(q, exercises));
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Sparkles className="h-4 w-4" /> {busy ? "Составляю…" : "Составить"}
        </TapButton>
      </DialogContent>
    </Dialog>
  );
}
