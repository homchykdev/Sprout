import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Pencil, Play, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TapButton } from "@/components/game/TapButton";
import { aiCreateWorkout } from "@/lib/clients";
import { nextWorkout, WEEKDAYS } from "@/lib/game";
import { useApp, uid } from "@/lib/store";
import type { Workout } from "@/lib/types";
import { cn } from "@/lib/utils";
import { estimateMinutes } from "@/lib/workout-utils";
import { LibraryContent } from "./library";

export const Route = createFileRoute("/plans")({
  head: () => ({
    meta: [
      { title: "Тренировки и расписание · Пульс" },
      {
        name: "description",
        content: "Составляй тренировки, план и гибкое расписание по дням недели.",
      },
      { property: "og:title", content: "Тренировки и расписание · Пульс" },
      { property: "og:description", content: "Персональные тренировки и гибкое расписание." },
    ],
  }),
  component: Plans,
});

function Plans() {
  const [tab, setTab] = useState<"workouts" | "exercises">("workouts");
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
      {tab === "workouts" ? <PlansContent /> : <LibraryContent />}
    </div>
  );
}

export function PlansContent() {
  const s = useApp();
  const nav = useNavigate();
  const [edit, setEdit] = useState<Workout | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const next = nextWorkout(s);
  const toggleDay = (d: number) =>
    s.set({
      schedule: {
        ...s.schedule,
        days: s.schedule.days.includes(d)
          ? s.schedule.days.filter((x) => x !== d)
          : [...s.schedule.days, d].sort(),
      },
    });
  const toggleRot = (id: string) =>
    s.set({
      schedule: {
        ...s.schedule,
        rotation: s.schedule.rotation.includes(id)
          ? s.schedule.rotation.filter((x) => x !== id)
          : [...s.schedule.rotation, id],
      },
    });

  return (
    <div className="space-y-5">
      <section className="card-soft p-5">
        <h2 className="font-bold">Дни тренировок</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Пропущенный день переносится на следующий в пределах недели.
        </p>
        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((d, i) => (
            <button
              key={d}
              onClick={() => toggleDay(i)}
              className={cn(
                "press h-11 rounded-2xl text-sm font-bold transition-colors",
                s.schedule.days.includes(i)
                  ? "bg-primary text-primary-foreground shadow-[0_3px_0_var(--primary-shade)]"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {d}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm font-medium">{s.schedule.days.length} тренировок в неделю</p>
      </section>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Мои тренировки</h2>
        <div className="flex gap-2">
          <TapButton
            size="sm"
            variant="flame"
            onClick={() =>
              s.ai.keys.length
                ? setAiOpen(true)
                : toast("Добавьте ИИ-ключ в Профиле")
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
      <p className="-mt-3 text-sm text-muted-foreground">
        Отмеченные тренировки чередуются по кругу — это твой план.
      </p>

      <div className="space-y-2.5">
        {s.workouts.map((w) => {
          const inRot = s.schedule.rotation.includes(w.id);
          return (
            <div
              key={w.id}
              className={cn("card-soft p-4", next?.id === w.id && "ring-2 ring-primary")}
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleRot(w.id)}
                  aria-label="В плане"
                  className={cn(
                    "press flex h-6 w-6 items-center justify-center rounded-lg border-2 text-xs font-bold",
                    inRot && "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {inRot ? s.schedule.rotation.indexOf(w.id) + 1 : ""}
                </button>
                <span className="text-2xl">{w.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {w.name}
                    {next?.id === w.id && (
                      <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-primary-shade">
                        СЛЕДУЮЩАЯ
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {w.items.length} упр. · ~{estimateMinutes(w, s.exercises)} мин
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

function WorkoutEditor({ value, onClose }: { value: Workout | null; onClose: () => void }) {
  const { exercises, upsertWorkout, deleteWorkout, workouts } = useApp();
  const [w, setW] = useState<Workout | null>(value);
  const [pick, setPick] = useState(false);
  const [q, setQ] = useState("");
  if (value && w?.id !== value.id) setW(value);
  if (!w || !value) return null;
  const items = w.items;
  const setItems = (x: Workout["items"]) => setW({ ...w, items: x });
  const move = (i: number, d: number) => {
    const x = [...items];
    [x[i], x[i + d]] = [x[i + d]!, x[i]!];
    setItems(x);
  };
  const num =
    "w-14 rounded-xl border-2 bg-card px-2 py-1 text-center text-sm tabular outline-none focus:border-primary";

  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-lg">
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
        <div className="space-y-2">
          {items.map((it, i) => {
            const ex = exercises.find((e) => e.id === it.exerciseId);
            return (
              <div key={i} className="rounded-2xl border-2 p-3">
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate font-semibold">
                    {ex?.emoji} {ex?.name ?? "Удалено"}
                  </span>
                  <button
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    className="p-1 text-muted-foreground disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    disabled={i === items.length - 1}
                    onClick={() => move(i, 1)}
                    className="p-1 text-muted-foreground disabled:opacity-30"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setItems(items.filter((_, j) => j !== i))}
                    className="p-1 text-muted-foreground"
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
                            items.map((x, j) => (j === i ? { ...x, seconds: +e.target.value } : x)),
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
                            items.map((x, j) => (j === i ? { ...x, reps: +e.target.value } : x)),
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
                      placeholder={ex?.bpm ? `♩${ex.bpm}` : "—"}
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
                                }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
        {pick ? (
          <div className="rounded-2xl border-2 p-2">
            <input
              autoFocus
              className="w-full rounded-xl bg-muted px-3 py-2 outline-none"
              placeholder="Поиск упражнения"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="mt-2 max-h-56 overflow-y-auto">
              {exercises
                .filter((e) => e.name.toLowerCase().includes(q.toLowerCase()))
                .map((e) => (
                  <button
                    key={e.id}
                    className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => {
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
                      setPick(false);
                      setQ("");
                    }}
                  >
                    {e.emoji} {e.name}
                  </button>
                ))}
            </div>
          </div>
        ) : (
          <TapButton variant="soft" onClick={() => setPick(true)}>
            <Plus className="h-4 w-4" /> Добавить упражнение
          </TapButton>
        )}
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
