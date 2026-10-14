import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Check, ChevronDown, SkipForward, Volume2, VolumeX, X } from "lucide-react";
import { beep, primeAudio, speak, stopSpeech } from "@/lib/voice";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Mascot } from "@/components/game/Mascot";
import { LinkMedia } from "@/components/game/LinkMedia";
import { ExerciseThumb, useExerciseMedia } from "@/components/game/ExerciseThumb";
import { useBlobUrl } from "@/lib/media";
import { parseLink } from "@/lib/embed";
import { TapButton } from "@/components/game/TapButton";
import { signedVideo } from "@/lib/clients";
import { MOTIVATION, streak, weekStatus } from "@/lib/game";
import { useApp, uid } from "@/lib/store";
import type { Exercise, SessionLog, WorkoutItem } from "@/lib/types";
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

type Step = { ex: Exercise; item: WorkoutItem; set: number };

function Player() {
  const { workoutId } = Route.useParams();
  const nav = useNavigate();
  const s = useApp();
  const workout = s.workouts.find((w) => w.id === workoutId);
  const steps = useMemo<Step[]>(() => {
    if (!workout) return [];
    return workout.items.flatMap((item) => {
      const ex = s.exercises.find((e) => e.id === item.exerciseId);
      return ex ? Array.from({ length: item.sets }, (_, i) => ({ ex, item, set: i + 1 })) : [];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutId]);

  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"work" | "rest" | "done">("work");
  const [left, setLeft] = useState(0);
  const [quit, setQuit] = useState(false);
  const [result, setResult] = useState<{ log: SessionLog; streakBefore: number; streakAfter: number } | null>(null);
  const startedAt = useRef(Date.now());
  const step = steps[idx];

  useEffect(() => {
    if (!step || phase === "done") return;
    if (phase === "work") setLeft(step.ex.mode === "time" ? step.item.seconds : 0);
    else setLeft(step.item.rest);
  }, [idx, phase, step]);

  // ---- voice & sound ----
  const muted = useApp((x) => x.voice.muted);
  useEffect(() => {
    primeAudio();
    return () => stopSpeech();
  }, []);
  useEffect(() => {
    if (!step || phase === "done") return;
    const amount = (st: Step) => (st.ex.mode === "time" ? `${st.item.seconds} секунд` : `${st.item.reps} повторений`);
    if (phase === "work") {
      const intro = idx === 0 ? "Начинаем. " : "";
      if (step.ex.mode === "time") {
        speak(`${intro}${step.set === 1 ? step.ex.name + ". " : ""}Старт!`, { interrupt: true });
        beep("go");
      } else speak(`${intro}${step.ex.name}. ${amount(step)}.`, { interrupt: true });
    } else {
      const nx = steps[idx + 1];
      if (nx) speak(`Отдых. Далее: ${nx.ex.name}, ${amount(nx)}.${nx.set === 1 && nx.ex.steps[0] ? " " + nx.ex.steps[0] : ""}`, { interrupt: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, phase]);
  useEffect(() => {
    if (!step || phase === "done" || left <= 0) return;
    const timedWork = phase === "work" && step.ex.mode === "time";
    if (phase === "work" && !timedWork) return;
    const total = phase === "work" ? step.item.seconds : step.item.rest;
    if (left === total) return;
    const cues = useApp.getState().voice.cues;
    if (left <= 3) beep("tick");
    else if (timedWork && cues && total >= 30 && left === 10) speak("Ещё 10 секунд!");
    else if (timedWork && cues && total >= 20 && left === Math.floor(total / 2)) speak("Половина!");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);
  useEffect(() => {
    const v = useApp.getState().voice;
    if (!step || phase !== "work" || !step.ex.bpm || muted || !v.beeps) return;
    const t = setInterval(() => beep("metro"), 60000 / Math.max(20, step.ex.bpm));
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, phase, muted]);

  useEffect(() => {
    if (phase === "done" || !step) return;
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
  }, [left, phase]);

  function finish() {
    const st = useApp.getState();
    const bonus = !weekStatus(st).dueToday;
    const sets = steps.map((x) => ({ exerciseId: x.ex.id, muscles: x.ex.muscles, category: x.ex.category, count: 1 }));
    const xp = Math.round((steps.length * 10 + 30) * (bonus ? 1.5 : 1));
    const log: SessionLog = { id: uid(), date: new Date().toISOString(), workoutId, workoutName: workout!.name, durationSec: Math.round((Date.now() - startedAt.current) / 1000), xp, sets };
    beep("end");
    speak("Тренировка завершена! Отличная работа!", { interrupt: true });
    const before = streak(st);
    st.logSession(log);
    setResult({ log, streakBefore: before, streakAfter: streak(useApp.getState()) });
    setPhase("done");
  }

  function advance() {
    if (phase === "work") {
      if (idx >= steps.length - 1) return finish();
      if (step!.item.rest > 0) setPhase("rest");
      else setIdx((i) => i + 1);
    } else {
      setIdx((i) => i + 1);
      setPhase("work");
    }
  }

  if (!workout || !steps.length)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <Mascot mood="sad" />
        <p className="font-semibold">Тренировка не найдена или пуста</p>
        <Link to="/plans" className="font-semibold text-primary-shade">К тренировкам</Link>
      </div>
    );

  if (phase === "done" && result) return <Summary result={result} onDone={() => nav({ to: "/" })} />;

  const progress = (idx + (phase === "rest" ? 1 : 0)) / steps.length;
  const nextStep = steps[idx + 1];

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col">
      <div className="flex items-center gap-4 px-5 pb-3 pt-5">
        <button onClick={() => setQuit(true)} aria-label="Выйти" className="press text-muted-foreground"><X className="h-7 w-7" /></button>
        <div className="h-4 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="relative h-full rounded-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${Math.max(3, progress * 100)}%` }}>
            <span className="absolute inset-x-2 top-1 h-1 rounded-full bg-primary-foreground/30" />
          </div>
        </div>
        <span className="text-sm font-bold tabular text-muted-foreground">{idx + 1}/{steps.length}</span>
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
        <RestView left={left} total={Math.max(step!.item.rest, left)} next={nextStep} onSkip={advance} onAdjust={(d) => setLeft((l) => Math.max(1, Math.min(600, l + d)))} />
      ) : (
        <WorkView key={idx} step={step!} left={left} onDone={advance} />
      )}

      <Dialog open={quit} onOpenChange={setQuit}>
        <DialogContent className="rounded-3xl text-center">
          <div className="flex justify-center"><Mascot mood="sad" size={90} /></div>
          <DialogTitle className="text-xl">Подожди, не уходи!</DialogTitle>
          <p className="text-muted-foreground">Ты уже прошёл {Math.round(progress * 100)}%. Если выйдешь сейчас — прогресс не сохранится.</p>
          <TapButton size="lg" onClick={() => setQuit(false)}>Продолжить</TapButton>
          <button className="py-2 text-sm font-bold uppercase tracking-wide text-destructive" onClick={() => nav({ to: "/" })}>Выйти</button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExerciseMedia({ ex }: { ex: Exercise }) {
  const own = useExerciseMedia(ex.mediaId);
  const ownUrl = useBlobUrl(own?.blob);
  if (own && ownUrl) return <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl bg-muted">{own.kind === "image" ? <img src={ownUrl} alt={ex.name} className="h-full w-full object-cover" /> : <video src={ownUrl} autoPlay muted loop playsInline className="h-full w-full object-cover" />}</div>;
  const link = ex.videoUrl ? parseLink(ex.videoUrl) : null;
  if (link && link.type !== "video") return <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl bg-muted"><LinkMedia url={ex.videoUrl!} clips={ex.clips} /></div>;
  return <FileMedia ex={ex} />;
}

function FileMedia({ ex }: { ex: Exercise }) {
  const [src, setSrc] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let on = true;
    setSrc(undefined); setFailed(false);
    signedVideo(ex.videoUrl).then((u) => on && setSrc(u)).catch(() => on && setFailed(true));
    return () => { on = false; };
  }, [ex.videoUrl]);
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl bg-muted">
      {src && !failed ? (
        <LinkMedia url={src} clips={ex.clips} onFail={() => setFailed(true)} />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2">
          <span className="animate-float text-8xl">{ex.emoji ?? "🏋️"}</span>
          {ex.videoUrl && <span className="text-xs text-muted-foreground">{failed ? "Видео недоступно" : "Загрузка видео…"}</span>}
        </div>
      )}
    </div>
  );
}

function WorkView({ step, left, onDone }: { step: Step; left: number; onDone: () => void }) {
  const { ex, item, set } = step;
  const [open, setOpen] = useState(false);
  const timed = ex.mode === "time";
  const pct = timed ? 1 - left / Math.max(1, item.seconds) : 0;
  return (
    <div className="animate-rise flex flex-1 flex-col px-5 pb-6">
      <ExerciseMedia ex={ex} />
      <div className="mt-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Подход {set} из {item.sets}</p>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight">{ex.name}</h1>
        </div>
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
          {timed && (
            <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
              <circle cx="50" cy="50" r="44" fill="none" stroke="var(--muted)" strokeWidth="9" />
              <circle cx="50" cy="50" r="44" fill="none" stroke="var(--primary)" strokeWidth="9" strokeLinecap="round" strokeDasharray={276.5} strokeDashoffset={276.5 * (1 - pct)} className="transition-[stroke-dashoffset] duration-1000 ease-linear" />
            </svg>
          )}
          <div className="text-center">
            <p className="text-4xl font-extrabold tabular leading-none">{timed ? left : item.reps}</p>
            <p className="text-[11px] font-semibold text-muted-foreground">{timed ? "сек" : "повт."}</p>
          </div>
        </div>
      </div>
      {ex.description && <p className="mt-2 text-[15px] text-muted-foreground">{ex.description}</p>}

      <button onClick={() => setOpen(!open)} className="mt-4 flex items-center justify-between rounded-2xl bg-muted px-4 py-3 text-sm font-semibold">
        Техника и ошибки <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      <div className={cn("grid transition-[grid-template-rows] duration-500", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <ol className="mt-3 space-y-2">
            {ex.steps.map((t, i) => (
              <li key={i} className="flex gap-3 text-[15px]"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-shade">{i + 1}</span>{t}</li>
            ))}
          </ol>
          {ex.mistakes.length > 0 && (
            <div className="mt-3 space-y-1.5 rounded-2xl bg-flame-soft p-4">
              {ex.mistakes.map((m, i) => (
                <p key={i} className="flex gap-2 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-flame-shade" />{m}</p>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-auto pt-6">
        <TapButton size="lg" className="w-full" onClick={onDone}>
          {timed ? <><SkipForward className="h-5 w-5" /> Дальше</> : <><Check className="h-5 w-5" strokeWidth={3} /> Готово</>}
        </TapButton>
      </div>
    </div>
  );
}

function RestView({ left, total, next, onSkip, onAdjust }: { left: number; total: number; next?: Step | undefined; onSkip: () => void; onAdjust: (d: number) => void }) {
  return (
    <div className="animate-rise flex flex-1 flex-col items-center px-5 pb-6 pt-10 text-center">
      <p className="text-sm font-bold uppercase tracking-wider text-sky-shade">Отдых</p>
      <div className="mt-2 flex items-center gap-5">
        <button onClick={() => onAdjust(-10)} aria-label="Меньше отдыха на 10 секунд" className="press flex h-14 w-14 items-center justify-center rounded-full border-2 bg-card text-base font-extrabold text-muted-foreground">−10</button>
        <p className="w-36 text-8xl font-extrabold tabular tracking-tight">{left}</p>
        <button onClick={() => onAdjust(10)} aria-label="Больше отдыха на 10 секунд" className="press flex h-14 w-14 items-center justify-center rounded-full border-2 bg-card text-base font-extrabold text-sky-shade">+10</button>
      </div>
      <div className="mt-4 h-2 w-48 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-sky transition-[width] duration-1000 ease-linear" style={{ width: `${(left / Math.max(1, total)) * 100}%` }} />
      </div>
      <Mascot mood="happy" size={90} className="mt-8" />
      <p className="mt-2 text-muted-foreground">Дыши глубже. Ты отлично справляешься!</p>
      {next && (
        <div className="card-soft mt-8 flex w-full items-center gap-3 p-4 text-left">
          <ExerciseThumb ex={next.ex} className="h-12 w-12" />
          <div>
            <p className="text-xs font-bold uppercase text-muted-foreground">Далее</p>
            <p className="font-semibold">{next.ex.name} · {next.ex.mode === "time" ? `${next.item.seconds} сек` : `${next.item.reps} повт.`}</p>
          </div>
        </div>
      )}
      <TapButton variant="sky" size="lg" className="mt-auto w-full" onClick={onSkip}>Пропустить отдых</TapButton>
    </div>
  );
}

const CONFETTI = ["var(--primary)", "var(--flame)", "var(--gold)", "var(--sky)"];

function Summary({ result, onDone }: { result: { log: SessionLog; streakBefore: number; streakAfter: number }; onDone: () => void }) {
  const { log, streakAfter } = result;
  const [phrase] = useState(() => MOTIVATION[Math.floor(Math.random() * MOTIVATION.length)]);
  const [pieces] = useState(() => Array.from({ length: 40 }, (_, i) => ({ left: Math.random() * 100, delay: Math.random() * 0.8, color: CONFETTI[i % 4], size: 6 + Math.random() * 8 })));
  const mins = Math.floor(log.durationSec / 60), secs = log.durationSec % 60;
  const stats = [
    { label: "Опыт", value: `+${log.xp}`, tone: "bg-gold-soft text-gold-shade border-gold" },
    { label: "Время", value: `${mins}:${String(secs).padStart(2, "0")}`, tone: "bg-sky-soft text-sky-shade border-sky" },
    { label: "Подходы", value: String(log.sets.length), tone: "bg-primary-soft text-primary-shade border-primary" },
  ];
  return (
    <div className="relative mx-auto flex min-h-screen max-w-xl flex-col items-center overflow-hidden px-5 pb-8 pt-16 text-center">
      {pieces.map((p, i) => (
        <span key={i} className="animate-confetti pointer-events-none absolute top-0 rounded-sm" style={{ left: `${p.left}%`, width: p.size, height: p.size * 1.6, background: p.color, animationDelay: `${p.delay}s` }} />
      ))}
      <Mascot mood="fire" size={150} className="animate-pop" />
      <h1 className="animate-rise mt-6 text-3xl font-extrabold tracking-tight text-gold-shade">Тренировка завершена!</h1>
      <p className="animate-rise mt-2 max-w-xs text-muted-foreground" style={{ animationDelay: "0.1s" }}>{phrase}</p>
      <div className="mt-8 grid w-full grid-cols-3 gap-3">
        {stats.map((st, i) => (
          <div key={st.label} className={cn("animate-pop overflow-hidden rounded-2xl border-2", st.tone)} style={{ animationDelay: `${0.3 + i * 0.15}s` }}>
            <p className="py-1.5 text-[11px] font-extrabold uppercase tracking-wider">{st.label}</p>
            <p className="bg-card py-3 text-2xl font-extrabold tabular text-foreground">{st.value}</p>
          </div>
        ))}
      </div>
      <div className="animate-pop mt-6 flex items-center gap-3 rounded-2xl bg-flame-soft px-5 py-3" style={{ animationDelay: "0.8s" }}>
        <span className="animate-flicker text-3xl">🔥</span>
        <p className="text-left font-bold text-flame-shade">Серия: {streakAfter} {streakAfter === 1 ? "тренировка" : "тренировок"}</p>
      </div>
      <TapButton size="lg" className="mt-auto w-full" onClick={onDone}>Продолжить</TapButton>
    </div>
  );
}
