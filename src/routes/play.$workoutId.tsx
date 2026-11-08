import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  AudioLines,
  Check,
  ChevronDown,
  Eye,
  Expand,
  SkipForward,
  Undo2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { beep, fanfare, primeAudio, speak, stopSpeech } from "@/lib/voice";
import { createRhythmPlayer } from "@/lib/rhythm";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DiaryForm } from "@/components/game/DiaryForm";
import { FeedbackEditor } from "@/components/game/FeedbackEditor";
import { ConfettiOverlay } from "@/components/game/Celebrate";
import { Mascot } from "@/components/game/Mascot";
import { ExerciseThumb } from "@/components/game/ExerciseThumb";
import { ExerciseMedia } from "@/components/game/ExerciseMedia";
import { ExerciseFullView } from "@/components/game/ExerciseFullView";
import { TapButton } from "@/components/game/TapButton";
import { MOTIVATION } from "@/lib/game";
import { dueToday, planProgress } from "@/lib/plan";
import { useApp, uid } from "@/lib/store";
import { buildSteps, itemIndexAtStep, type Step } from "@/lib/session";
import { SessionEditorSheet } from "@/components/game/SessionEditorSheet";
import type { Difficulty, Exercise, Feedback, SessionLog, WorkoutItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/play/$workoutId")({
  head: () => ({
    meta: [
      { title: "Тренировка · Пульс" },
      { name: "description", content: "Выполняй упражнения по порядку с видео и таймером." },
      { property: "og:title", content: "Тренировка · Пульс" },
      { property: "og:description", content: "Выполняй упражнения по порядку с видео и таймером." },
    ],
  }),
  component: Player,
});

type Phase = "prep" | "work" | "rest" | "done";

/** Readiness countdown before the very first exercise (default 5 s, 0 = off). */
function prepSeconds(): number {
  return Math.max(0, useApp.getState().workoutSettings.prepSeconds | 0);
}

function Player() {
  const { workoutId } = Route.useParams();
  const nav = useNavigate();
  const s = useApp();
  const workout = s.workouts.find((w) => w.id === workoutId);
  // The session runs on its own copy of the items — mid-session editing must not touch the
  // stored workout until the user saves changes after completion.
  const [items, setItems] = useState<WorkoutItem[]>(() => workout?.items ?? []);
  const [dirty, setDirty] = useState(false);
  const steps = buildSteps(items, s.exercises);

  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>(() => (prepSeconds() > 0 ? "prep" : "work"));
  const [left, setLeft] = useState(() => Math.max(0, prepSeconds()));
  const [quit, setQuit] = useState(false);
  /** Exercise currently shown in the full-view dialog (current, next or from prep). */
  const [full, setFull] = useState<Exercise | null>(null);
  /** Session composition sheet (opened from the progress bar). */
  const [edit, setEdit] = useState(false);
  /** Ids of open UI (dialogs/sheets) that hold the timer; auto-pause covers focus loss. */
  const [pauseSources, setPauseSources] = useState<string[]>([]);
  const [autoPaused, setAutoPaused] = useState(false);
  const paused = phase !== "done" && (pauseSources.length > 0 || autoPaused);
  const addPause = (id: string) => setPauseSources((xs) => (xs.includes(id) ? xs : [...xs, id]));
  const removePause = (id: string) => setPauseSources((xs) => xs.filter((x) => x !== id));
  // Pause inside the auto-pause overlay counts toward the session duration as paused time.
  const pausedSince = useRef<number | null>(null);
  const pausedMs = useRef(0);
  const [result, setResult] = useState<{
    log: SessionLog;
    streakBefore: number;
    streakAfter: number;
  } | null>(null);
  /** User edited the session — offer to write the changes into the stored workout on finish. */
  const [savePrompt, setSavePrompt] = useState(false);
  const startedAt = useRef(Date.now());
  const step = steps[idx];

  useEffect(() => {
    if (!step || phase === "done") return;
    if (phase === "work") setLeft(step.ex.mode === "time" ? step.item.seconds : 0);
    else if (phase === "prep") setLeft(prepSeconds());
    else setLeft(step.item.rest);
  }, [idx, phase, step]);

  // ---- session edits: keep the position valid ----
  useEffect(() => {
    if (idx >= steps.length && steps.length) {
      setIdx(steps.length - 1);
      setPhase("work");
    }
  }, [idx, steps.length]);
  useEffect(() => {
    if (phase === "rest" && step && step.item.rest <= 0) setPhase("work");
  }, [phase, step]);

  // ---- pause bookkeeping: stop speech, count paused time ----
  useEffect(() => {
    if (full) addPause("full");
    else removePause("full");
  }, [full]);
  useEffect(() => {
    if (edit) addPause("edit");
    else removePause("edit");
  }, [edit]);
  useEffect(() => {
    stopSpeech();
    if (paused) {
      if (pausedSince.current === null) pausedSince.current = Date.now();
      return;
    }
    if (pausedSince.current !== null) {
      pausedMs.current += Date.now() - pausedSince.current;
      pausedSince.current = null;
    }
  }, [paused]);
  useEffect(() => {
    // The app lost the screen (backgrounded, tab hidden, another app) — freeze the session
    // until the user explicitly resumes on the overlay.
    const onHide = () => setAutoPaused(true);
    window.addEventListener("blur", onHide);
    const onVis = () => {
      if (document.visibilityState === "hidden") onHide();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("blur", onHide);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // ---- voice & sound ----
  const muted = useApp((x) => x.voice.muted);
  useEffect(() => {
    primeAudio();
    return () => stopSpeech();
  }, []);
  useEffect(() => {
    if (!step || phase === "done" || paused) return;
    const amount = (st: Step) =>
      st.ex.mode === "time" ? `${st.item.seconds} секунд` : `${st.item.reps} повторений`;
    if (phase === "prep") {
      const first = steps[0];
      if (first) speak(`Приготовься: ${first.ex.name}, ${amount(first)}.`, { interrupt: true });
      return;
    }
    if (phase === "work") {
      const intro = idx === 0 ? "Начинаем. " : "";
      if (step.ex.mode === "time") {
        speak(`${intro}${step.set === 1 ? step.ex.name + ". " : ""}Старт!`, { interrupt: true });
        beep("go");
      } else speak(`${intro}${step.ex.name}. ${amount(step)}.`, { interrupt: true });
    } else {
      const nx = steps[idx + 1];
      if (nx)
        speak(
          `Отдых. Далее: ${nx.ex.name}, ${amount(nx)}.${nx.set === 1 && nx.ex.steps[0] ? " " + nx.ex.steps[0] : ""}`,
          { interrupt: true },
        );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, phase, paused]);
  useEffect(() => {
    if (!step || phase === "done" || left <= 0) return;
    const timedWork = phase === "work" && step.ex.mode === "time";
    if (phase === "work" && !timedWork) return;
    const total =
      phase === "work" ? step.item.seconds : phase === "prep" ? prepSeconds() : step.item.rest;
    if (left === total) return;
    const cues = useApp.getState().voice.cues;
    if (left <= 3) beep("tick");
    else if (timedWork && cues && total >= 30 && left === 10) speak("Ещё 10 секунд!");
    else if (timedWork && cues && total >= 20 && left === Math.floor(total / 2)) speak("Половина!");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);
  useEffect(() => {
    const v = useApp.getState().voice;
    const bpm = step?.item.bpm ?? step?.ex.bpm;
    if (paused || !step || phase !== "work" || !bpm || muted || !v.metronome) return;
    const t = setInterval(() => beep("metro"), 60000 / Math.max(20, bpm));
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, phase, muted, paused]);

  useEffect(() => {
    if (paused || phase === "done" || !step) return;
    if (phase === "prep") {
      if (left <= 0) return;
      const tp = setTimeout(() => {
        if (left === 1) {
          beep("go");
          setPhase("work");
        } else setLeft((l) => l - 1);
      }, 1000);
      return () => clearTimeout(tp);
    }
    if (phase === "work" && step.ex.mode !== "time") return;
    if (left <= 0) return;
    const t = setTimeout(() => {
      if (left === 1) {
        if (phase === "work") beep("end");
        advance();
      }
      setLeft((l) => l - 1);
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, phase, paused]);

  function finish() {
    const st = useApp.getState();
    const bonus = !dueToday(st);
    const sets = steps.map((x) => ({
      exerciseId: x.ex.id,
      muscles: x.ex.muscles,
      category: x.ex.category,
      count: 1,
    }));
    const xp = Math.round((steps.length * 10 + 30) * (bonus ? 1.5 : 1));
    const log: SessionLog = {
      id: uid(),
      date: new Date().toISOString(),
      workoutId,
      workoutName: workout!.name,
      durationSec: Math.max(
        0,
        Math.round((Date.now() - startedAt.current - pausedMs.current) / 1000),
      ),
      xp,
      sets,
    };
    fanfare("workout");
    speak("Тренировка завершена! Отличная работа!", { interrupt: true });
    const before = planProgress(st).streak;
    st.logSession(log);
    setResult({ log, streakBefore: before, streakAfter: planProgress(useApp.getState()).streak });
    if (dirty) setSavePrompt(true);
    setPhase("done");
  }

  function advance() {
    if (phase === "prep") {
      beep("go");
      setPhase("work");
      return;
    }
    if (phase === "work") {
      fanfare("set");
      if (idx >= steps.length - 1) return finish();
      if (step!.item.rest > 0) setPhase("rest");
      else setIdx((i) => i + 1);
    } else {
      setIdx((i) => i + 1);
      setPhase("work");
    }
  }

  /** One step back: from rest — redo the just-finished set, from work — the previous set. */
  function goBack() {
    if (phase === "rest") {
      setPhase("work");
      return;
    }
    if (phase === "work" && idx > 0) {
      setIdx((i) => i - 1);
      setPhase("work");
    }
  }

  if (!workout || !steps.length)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <Mascot mood="sad" />
        <p className="font-semibold">Тренировка не найдена или пуста</p>
        <Link to="/plans" className="font-semibold text-primary-shade">
          К тренировкам
        </Link>
      </div>
    );

  if (phase === "done" && result)
    return (
      <>
        <Summary result={result} onDone={() => nav({ to: "/" })} />
        <Dialog
          open={savePrompt}
          onOpenChange={(o) => {
            setSavePrompt(o);
            if (!o) setDirty(false);
          }}
        >
          <DialogContent className="rounded-3xl text-center">
            <DialogTitle className="text-xl">Сохранить состав тренировки?</DialogTitle>
            <p className="text-balance text-muted-foreground">
              Ты менял состав этой сессии. Записать изменения в тренировку «{workout?.name}»?
            </p>
            <TapButton
              size="lg"
              className="w-full"
              onClick={() => {
                if (workout) {
                  useApp.getState().upsertWorkout({ ...workout, items });
                  toast.success("Изменения сохранены");
                }
                setSavePrompt(false);
                setDirty(false);
              }}
            >
              Сохранить
            </TapButton>
            <button
              className="py-2 text-sm font-bold uppercase tracking-wide text-muted-foreground"
              onClick={() => {
                setSavePrompt(false);
                setDirty(false);
              }}
            >
              Оставить как есть
            </button>
          </DialogContent>
        </Dialog>
      </>
    );

  const progress = (idx + (phase === "rest" ? 1 : 0)) / steps.length;
  const nextStep = steps[idx + 1];

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col">
      <div className="flex items-center gap-4 px-5 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <button
          onClick={() => setQuit(true)}
          aria-label="Выйти"
          className="press text-muted-foreground"
        >
          <X className="h-7 w-7" />
        </button>
        <button
          type="button"
          onClick={() => setEdit(true)}
          aria-label="Список упражнений — посмотреть и изменить сессию"
          title="Начало, порядок и правки текущей сессии"
          className="press relative -my-2 flex-1 rounded-full py-2"
        >
          <div className="h-4 overflow-hidden rounded-full bg-muted">
            <div
              className="relative h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
              style={{ width: `${Math.max(3, progress * 100)}%` }}
            >
              <span className="absolute inset-x-2 top-1 h-1 rounded-full bg-primary-foreground/30" />
            </div>
          </div>
        </button>
        <span className="text-sm font-bold tabular text-muted-foreground">
          {idx + 1}/{steps.length}
        </span>
        <button
          onClick={goBack}
          disabled={phase === "prep" || (phase === "work" && idx === 0)}
          aria-label="К предыдущему упражнению"
          className="press text-muted-foreground disabled:opacity-30"
        >
          <Undo2 className="h-6 w-6" />
        </button>
        <button
          aria-label={muted ? "Включить звук" : "Выключить звук"}
          className="press text-muted-foreground"
          onClick={() => {
            const v = useApp.getState().voice;
            if (!v.muted) stopSpeech();
            useApp.getState().set({ voice: { ...v, muted: !v.muted } });
          }}
        >
          {muted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
        </button>
      </div>

      {phase === "rest" ? (
        <RestView
          left={left}
          total={Math.max(step!.item.rest, left)}
          next={nextStep}
          onSkip={advance}
          onAdjust={(d) => setLeft((l) => Math.max(1, Math.min(600, l + d)))}
          onNextDetails={() => nextStep && setFull(nextStep.ex)}
        />
      ) : phase === "prep" ? (
        <PrepView
          left={left}
          first={steps[0]}
          onStart={advance}
          onDetails={() => steps[0] && setFull(steps[0].ex)}
        />
      ) : (
        <WorkView
          key={idx}
          step={step!}
          left={left}
          onDone={advance}
          paused={paused}
          next={nextStep}
          onDetails={(ex) => setFull(ex)}
          onNextPreview={() => nextStep && setFull(nextStep.ex)}
        />
      )}

      {/* Quit dialog doubles as a pause: while it is open the countdown is frozen. */}
      <Dialog
        open={quit}
        onOpenChange={(o) => {
          setQuit(o);
          if (o) addPause("quit");
          else removePause("quit");
        }}
      >
        <DialogContent className="rounded-3xl text-center">
          <div className="flex justify-center">
            <Mascot mood="sad" size={90} />
          </div>
          <DialogTitle className="text-xl">Подожди, не уходи!</DialogTitle>
          <p className="text-muted-foreground">
            Ты уже прошёл {Math.round(progress * 100)}%. Если выйдешь сейчас — прогресс не
            сохранится.
          </p>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Тренировка на паузе — закрой окно, чтобы продолжить
          </p>
          <TapButton size="lg" onClick={() => setQuit(false)}>
            Продолжить
          </TapButton>
          <button
            className="py-2 text-sm font-bold uppercase tracking-wide text-destructive"
            onClick={() => nav({ to: "/" })}
          >
            Выйти
          </button>
        </DialogContent>
      </Dialog>

      {/* Full-exercise dialog: every open pauses the countdown. */}
      <ExerciseFullView
        ex={full}
        open={!!full}
        onOpenChange={(o) => {
          if (!o) setFull(null);
        }}
      />

      {/* Session composition: view what is coming and edit this session only. */}
      <SessionEditorSheet
        open={edit}
        onOpenChange={setEdit}
        items={items}
        currentItemIndex={Math.max(0, itemIndexAtStep(items, steps, idx))}
        onDetails={(ex) => setFull(ex)}
        onChange={(next) => {
          setItems(next);
          setDirty(true);
        }}
        onGoTo={(i) => {
          const k = steps.findIndex((st) => st.item === items[i]);
          if (k >= 0) {
            setIdx(k);
            setPhase("work");
          }
        }}
      />

      {/* Auto-pause (tab hidden / app backgrounded): explicit resume, nothing auto-runs. */}
      {autoPaused && !quit && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background/90 p-8 text-center backdrop-blur-sm">
          <Mascot mood="happy" size={120} />
          <div>
            <p className="text-2xl font-extrabold tracking-tight">Пауза</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ты вышел из приложения — таймер заморожен на {Math.round(progress * 100)}% пути
            </p>
          </div>
          <TapButton size="lg" className="w-full max-w-64" onClick={() => setAutoPaused(false)}>
            Продолжить
          </TapButton>
        </div>
      )}
    </div>
  );
}

function WorkView({
  step,
  left,
  onDone,
  paused,
  next,
  onDetails,
  onNextPreview,
}: {
  step: Step;
  left: number;
  onDone: () => void;
  paused: boolean;
  next?: Step | undefined;
  /** Opens the full-exercise dialog; the parent registers the pause. */
  onDetails: (ex: Exercise) => void;
  onNextPreview?: (() => void) | undefined;
}) {
  const { ex, item, set } = step;
  const [open, setOpen] = useState(false);
  const timed = ex.mode === "time";
  const pct = timed ? 1 - left / Math.max(1, item.seconds) : 0;
  // Tapped rhythm loops for the whole set; WorkView is keyed per step, so the
  // player starts/stops exactly with the exercise — same lifecycle as the speech cues.
  const muted = useApp((x) => x.voice.muted);
  const metronomeOn = useApp((x) => x.voice.metronome);
  const rhythm = item.rhythm?.length ? item.rhythm : ex.rhythm?.length ? ex.rhythm : undefined;
  const pulse = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const v = useApp.getState().voice;
    if (!rhythm || muted || !v.metronome || paused) return;
    const onBeat = () => {
      const el = pulse.current;
      if (!el) return;
      el.classList.remove("beat-flash");
      void el.offsetWidth;
      el.classList.add("beat-flash");
    };
    const p = createRhythmPlayer({ intervals: rhythm, onBeat });
    p.start();
    return () => p.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rhythm?.join(","), muted, paused]);
  const rhythmActive = !!rhythm && metronomeOn && !muted;
  return (
    <div className="animate-rise flex flex-1 flex-col px-5 pb-6">
      <ExerciseMedia ex={ex} />
      <div className="mt-5 flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Подход {set} из {item.sets}
            {rhythmActive && (
              <span
                ref={pulse}
                title="Ритм звучит в цикле, первый удар — акцентный"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-soft"
              >
                <AudioLines className="h-3 w-3 text-primary-shade" aria-hidden />
              </span>
            )}
          </p>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight">{ex.name}</h1>
        </div>
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
          {timed && (
            <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
              <circle cx="50" cy="50" r="44" fill="none" stroke="var(--muted)" strokeWidth="9" />
              <circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                stroke="var(--primary)"
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={276.5}
                strokeDashoffset={276.5 * (1 - pct)}
                className="transition-[stroke-dashoffset] duration-1000 ease-linear"
              />
            </svg>
          )}
          <div className="text-center">
            <p className="text-4xl font-extrabold tabular leading-none">
              {timed ? left : item.reps}
            </p>
            <p className="text-[11px] font-semibold text-muted-foreground">
              {timed ? "сек" : "повт."}
            </p>
          </div>
        </div>
      </div>
      {ex.description && <p className="mt-2 text-[15px] text-muted-foreground">{ex.description}</p>}

      <button
        onClick={() => setOpen(!open)}
        className="mt-4 flex items-center justify-between rounded-2xl bg-muted px-4 py-3 text-sm font-semibold"
      >
        Техника и ошибки{" "}
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-500",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <ol className="mt-3 space-y-2">
            {ex.steps.map((t, i) => (
              <li key={i} className="flex gap-3 text-[15px]">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-shade">
                  {i + 1}
                </span>
                {t}
              </li>
            ))}
          </ol>
          {ex.mistakes.length > 0 && (
            <div className="mt-3 space-y-1.5 rounded-2xl bg-flame-soft p-4">
              {ex.mistakes.map((m, i) => (
                <p key={i} className="flex gap-2 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-flame-shade" />
                  {m}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        onClick={() => onDetails(ex)}
        className="press -mt-2 flex items-center gap-2 py-2 text-sm font-semibold text-primary-shade"
      >
        <Expand className="h-4 w-4" /> Прочитать целиком
      </button>

      {next && onNextPreview && (
        <button
          onClick={onNextPreview}
          aria-label="Посмотреть следующее упражнение (тренировка встанет на паузу)"
          className="press mt-3 flex w-full items-center justify-between rounded-2xl bg-sky-soft px-4 py-3 text-left"
        >
          <span className="min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-sky-shade">
              Далее
            </span>
            <span className="block truncate font-semibold">
              {next.ex.name} ·{" "}
              {next.ex.mode === "time" ? `${next.item.seconds} сек` : `${next.item.reps} повт.`}
            </span>
          </span>
          <Eye className="ml-3 h-4 w-4 shrink-0 text-sky-shade" />
        </button>
      )}

      <div className="mt-auto pt-6">
        <TapButton size="lg" className="w-full" onClick={onDone}>
          {timed ? (
            <>
              <SkipForward className="h-5 w-5" /> Дальше
            </>
          ) : (
            <>
              <Check className="h-5 w-5" strokeWidth={3} /> Готово
            </>
          )}
        </TapButton>
      </div>
    </div>
  );
}

/** Readiness countdown: glance at the first exercise, hear its name, then go. */
function PrepView({
  left,
  first,
  onStart,
  onDetails,
}: {
  left: number;
  first?: Step | undefined;
  onStart: () => void;
  onDetails: () => void;
}) {
  return (
    <div className="animate-rise flex flex-1 flex-col items-center px-5 pb-6 pt-10 text-center">
      <p className="text-sm font-bold uppercase tracking-wider text-primary-shade">Приготовься</p>
      <p className="mt-2 text-7xl font-extrabold tabular tracking-tight">{left}</p>
      <div className="mt-4 h-2 w-48 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear"
          style={{ width: `${(left / Math.max(1, prepSeconds())) * 100}%` }}
        />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Вдох-выдох. Сейчас начнём первое упражнение.
      </p>
      {first && (
        <button
          onClick={onDetails}
          aria-label="Прочитать первое упражнение целиком"
          className="press card-soft mt-8 flex w-full items-center gap-3 p-4 text-left"
        >
          <ExerciseThumb ex={first.ex} className="h-12 w-12" />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-muted-foreground">Первое</p>
            <p className="truncate font-semibold">
              {first.ex.name} ·{" "}
              {first.ex.mode === "time" ? `${first.item.seconds} сек` : `${first.item.reps} повт.`}
            </p>
          </div>
          <Eye className="ml-auto h-4 w-4 shrink-0 text-primary-shade" />
        </button>
      )}
      <Mascot mood="happy" size={90} className="mt-6" />
      <TapButton size="lg" className="mt-auto w-full" onClick={onStart}>
        Начать
      </TapButton>
    </div>
  );
}

function RestView({
  left,
  total,
  next,
  onSkip,
  onAdjust,
  onNextDetails,
}: {
  left: number;
  total: number;
  next?: Step | undefined;
  onSkip: () => void;
  onAdjust: (d: number) => void;
  /** Opens the full view of the upcoming exercise; the parent registers the pause. */
  onNextDetails?: (() => void) | undefined;
}) {
  return (
    <div className="animate-rise flex flex-1 flex-col items-center px-5 pb-6 pt-10 text-center">
      <p className="text-sm font-bold uppercase tracking-wider text-sky-shade">Отдых</p>
      <div className="mt-2 flex items-center gap-5">
        <button
          onClick={() => onAdjust(-10)}
          aria-label="Меньше отдыха на 10 секунд"
          className="press flex h-14 w-14 items-center justify-center rounded-full border-2 bg-card text-base font-extrabold text-muted-foreground"
        >
          −10
        </button>
        <p className="w-36 text-8xl font-extrabold tabular tracking-tight">{left}</p>
        <button
          onClick={() => onAdjust(10)}
          aria-label="Больше отдыха на 10 секунд"
          className="press flex h-14 w-14 items-center justify-center rounded-full border-2 bg-card text-base font-extrabold text-sky-shade"
        >
          +10
        </button>
      </div>
      <div className="mt-4 h-2 w-48 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-sky transition-[width] duration-1000 ease-linear"
          style={{ width: `${(left / Math.max(1, total)) * 100}%` }}
        />
      </div>
      <Mascot mood="happy" size={90} className="mt-8" />
      <p className="mt-2 text-muted-foreground">Дыши глубже. Ты отлично справляешься!</p>
      {next && (
        <div
          onClick={onNextDetails}
          className={cn(
            "card-soft mt-8 flex w-full items-center gap-3 p-4 text-left",
            onNextDetails && "press cursor-pointer",
          )}
        >
          <ExerciseThumb ex={next.ex} className="h-12 w-12" />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-muted-foreground">Далее</p>
            <p className="truncate font-semibold">
              {next.ex.name} ·{" "}
              {next.ex.mode === "time" ? `${next.item.seconds} сек` : `${next.item.reps} повт.`}
            </p>
          </div>
          {onNextDetails && <Eye className="ml-auto h-4 w-4 shrink-0 text-sky-shade" />}
        </div>
      )}
      <TapButton variant="sky" size="lg" className="mt-auto w-full" onClick={onSkip}>
        Пропустить отдых
      </TapButton>
    </div>
  );
}

function Summary({
  result,
  onDone,
}: {
  result: { log: SessionLog; streakBefore: number; streakAfter: number };
  onDone: () => void;
}) {
  const { log, streakAfter } = result;
  const [phrase] = useState(() => MOTIVATION[Math.floor(Math.random() * MOTIVATION.length)]);
  const mins = Math.floor(log.durationSec / 60),
    secs = log.durationSec % 60;
  const stats = [
    { label: "Опыт", value: `+${log.xp}`, tone: "bg-gold-soft text-gold-shade border-gold" },
    {
      label: "Время",
      value: `${mins}:${String(secs).padStart(2, "0")}`,
      tone: "bg-sky-soft text-sky-shade border-sky",
    },
    {
      label: "Подходы",
      value: String(log.sets.length),
      tone: "bg-primary-soft text-primary-shade border-primary",
    },
  ];
  return (
    <div className="relative mx-auto flex min-h-[100dvh] max-w-xl flex-col items-center overflow-hidden px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-center">
      <ConfettiOverlay count={40} />
      <Mascot mood="fire" size={150} className="animate-pop" />
      <h1 className="animate-rise mt-6 text-3xl font-extrabold tracking-tight text-gold-shade">
        Тренировка завершена!
      </h1>
      <p
        className="animate-rise mt-2 max-w-xs text-muted-foreground"
        style={{ animationDelay: "0.1s" }}
      >
        {phrase}
      </p>
      <div className="mt-8 grid w-full grid-cols-3 gap-3">
        {stats.map((st, i) => (
          <div
            key={st.label}
            className={cn("animate-pop overflow-hidden rounded-2xl border-2", st.tone)}
            style={{ animationDelay: `${0.3 + i * 0.15}s` }}
          >
            <p className="py-1.5 text-[11px] font-extrabold uppercase tracking-wider">{st.label}</p>
            <p className="bg-card py-3 text-2xl font-extrabold tabular text-foreground">
              {st.value}
            </p>
          </div>
        ))}
      </div>
      <div
        className="animate-pop mt-6 flex items-center gap-3 rounded-2xl bg-flame-soft px-5 py-3"
        style={{ animationDelay: "0.8s" }}
      >
        <span className="animate-flicker text-3xl">🔥</span>
        <p className="text-left font-bold text-flame-shade">
          Серия: {streakAfter} {streakAfter === 1 ? "тренировка" : "тренировок"}
        </p>
      </div>
      <div className="animate-rise mt-4 w-full" style={{ animationDelay: "0.9s" }}>
        <DiaryForm sessionId={log.id} />
      </div>
      <div className="animate-rise mt-3 w-full" style={{ animationDelay: "1s" }}>
        <WorkoutFeedback workoutId={log.workoutId} />
      </div>
      <TapButton size="lg" className="mt-4 w-full" onClick={onDone}>
        Продолжить
      </TapButton>
    </div>
  );
}

/** Post-workout rating: difficulty + like/dislike, saved to the workout for AI planning. */
function WorkoutFeedback({ workoutId }: { workoutId: string }) {
  const workout = useApp((s) => s.workouts.find((w) => w.id === workoutId));
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState<{
    difficulty?: Difficulty | undefined;
    verdict?: "like" | "dislike" | undefined;
  }>(() => ({
    difficulty: workout?.feedback?.difficulty,
    verdict: workout?.feedback?.verdict,
  }));
  if (!workout) return null;
  return (
    <div className="card-soft w-full p-5 text-left">
      <p className="font-bold">Оцените тренировку</p>
      <p className="text-sm text-muted-foreground">Учитывается при планировании тренировок от ИИ</p>
      <div className="mt-3">
        <FeedbackEditor
          value={pending.difficulty}
          onChange={(difficulty) => {
            setPending((p) => ({ ...p, difficulty }));
            setSaved(false);
          }}
          isLike={
            pending.verdict === "like" ? true : pending.verdict === "dislike" ? false : undefined
          }
          onVerdict={(verdict) => {
            setPending((p) => ({ ...p, verdict }));
            setSaved(false);
          }}
        />
      </div>
      <TapButton
        variant="soft"
        size="sm"
        className="mt-3 min-h-[44px] w-full"
        onClick={() => {
          const fb: Feedback | undefined =
            pending.difficulty === undefined && pending.verdict === undefined
              ? undefined
              : { difficulty: pending.difficulty, verdict: pending.verdict };
          useApp.getState().rateWorkout(workoutId, fb ?? {});
          setSaved(true);
        }}
      >
        {saved ? "Спасибо! ✓" : "Сохранить оценку"}
      </TapButton>
    </div>
  );
}
