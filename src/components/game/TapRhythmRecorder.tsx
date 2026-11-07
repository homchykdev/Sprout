import { useEffect, useRef, useState } from "react";
import { Hand, Play, Plus, RotateCcw, Square, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import {
  RHYTHM,
  analyzeTaps,
  createRhythmPlayer,
  cycleTime,
  impliedBpm,
  sanitizeRhythm,
  type TapAnalysis,
} from "@/lib/rhythm";
import { primeAudio } from "@/lib/voice";
import { cn } from "@/lib/utils";
import { TapButton } from "./TapButton";

const sec = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} с`;

/**
 * Tap-tempo rhythm recorder: the user taps a repeating pattern several times,
 * the analyzer finds the cycle and averages the taps; every interval stays
 * editable in ms in case detection got it wrong.
 */
export function TapRhythmRecorder({
  value,
  onChange,
}: {
  value: number[] | undefined;
  onChange: (rhythm: number[] | undefined) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const [analysis, setAnalysis] = useState<TapAnalysis | null>(null);
  const [playing, setPlaying] = useState(false);
  const taps = useRef<number[]>([]);
  const player = useRef<ReturnType<typeof createRhythmPlayer> | null>(null);
  const beatRows = useRef<(HTMLLIElement | null)[]>([]);

  const rhythm = value?.length ? value : undefined;

  const stopPlayer = () => {
    player.current?.stop();
    player.current = null;
    setPlaying(false);
  };
  useEffect(stopPlayer, []);

  const begin = () => {
    stopPlayer();
    setAnalysis(null);
    taps.current = [];
    setTapCount(0);
    setRecording(true);
  };

  const tap = () => {
    if (taps.current.length >= 100) {
      finish(true);
      return;
    }
    taps.current.push(performance.now());
    setTapCount(taps.current.length);
  };

  const finish = (capped = false) => {
    setRecording(false);
    if (capped) toast.info("Предел записи — берём то, что уже настучано");
    else primeAudio();
    const a = analyzeTaps(taps.current);
    if (!a || a.intervals.length < 1) {
      toast.error("Нужно минимум два удара подряд");
      return;
    }
    const clean = sanitizeRhythm(a.intervals);
    if (!clean) {
      toast.error("Не разобрал ритм — постучи ещё раз");
      return;
    }
    setAnalysis(a);
    onChange(clean);
  };

  const play = () => {
    if (playing || !rhythm) return stopPlayer();
    primeAudio();
    setPlaying(true);
    player.current = createRhythmPlayer({
      intervals: rhythm,
      onBeat: (slot) => {
        const rows = beatRows.current;
        rows.forEach((el, i) => el?.classList.toggle("beat-on", i === slot));
      },
    });
    player.current.start();
  };

  const edit = (next: number[]) => {
    stopPlayer();
    setAnalysis(null); // analyzer metadata no longer describes a hand-edited pattern
    onChange(sanitizeRhythm(next) ?? undefined);
  };

  const bpm = rhythm ? impliedBpm(rhythm) : null;
  return (
    <div className="space-y-2.5 rounded-2xl bg-muted p-3">
      {recording ? (
        <>
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              tap();
            }}
            className="press flex min-h-[88px] w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-primary bg-card py-4 outline-none"
            aria-label="Удар ритма"
          >
            <Hand className="h-7 w-7 text-primary-shade" />
            <span className="text-sm font-semibold text-primary-shade tabular">
              Ударов: {tapCount}
            </span>
          </button>
          <p className="text-xs text-muted-foreground">
            Стучи 2–3 полных повтора ритма. Не делай пауз дольше 5 с и между ударами минимум 60 мс.
          </p>
          <div className="flex gap-2">
            <TapButton
              variant="soft"
              disabled={tapCount < 3}
              onClick={() => finish()}
              className="flex-1"
            >
              <Square className="h-4 w-4" /> Готово
            </TapButton>
            <TapButton variant="ghost" onClick={begin}>
              <RotateCcw className="h-4 w-4" /> Заново
            </TapButton>
          </div>
        </>
      ) : rhythm ? (
        <>
          <div className="flex items-center gap-2.5">
            <TapButton
              variant={playing ? "sky" : "primary"}
              size="sm"
              onClick={play}
              className="min-h-[44px] shrink-0"
            >
              {playing ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {playing ? "Стоп" : "Прослушать"}
            </TapButton>
            <span className="text-sm font-semibold tabular">
              Цикл {sec(cycleTime(rhythm))}
              {bpm ? ` · ~${bpm} уд/мин` : ""}
            </span>
            <TapButton variant="ghost" size="sm" onClick={begin} className="ml-auto shrink-0">
              <RotateCcw className="h-4 w-4" /> Перезаписать
            </TapButton>
          </div>
          <ul className="space-y-1.5">
            {rhythm.map((ms, i) => (
              <li
                key={i}
                ref={(el) => {
                  beatRows.current[i] = el;
                }}
                className="beat-row flex items-center gap-2 p-1"
              >
                <span
                  className={cn(
                    "h-2.5 w-2.5 shrink-0 rounded-full",
                    i === 0 ? "bg-primary" : "bg-muted-foreground/40",
                  )}
                  title={i === 0 ? "Акцентный удар" : "Удар"}
                />
                <span className="w-10 shrink-0 text-xs text-muted-foreground tabular">
                  #{i + 1}
                </span>
                <IntervalInput value={ms} onCommit={(v) => edit(replace(rhythm, i, v))} />
                <button
                  aria-label={`Удалить удар #${i + 1}`}
                  disabled={rhythm.length <= 1}
                  onClick={() => edit(without(rhythm, i))}
                  className="press rounded-full p-2 text-muted-foreground disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <TapButton
              variant="soft"
              size="sm"
              disabled={rhythm.length >= RHYTHM.maxIntervals}
              onClick={() => edit([...rhythm, RHYTHM.minIntervalMs])}
            >
              <Plus className="h-4 w-4" /> Интервал
            </TapButton>
            <span className="text-xs text-muted-foreground">
              {RHYTHM.minIntervalMs}–{RHYTHM.maxIntervalMs} мс
            </span>
          </div>
          {(analysis?.unstable || (analysis && analysis.cycles < 2)) && (
            <p className="flex gap-1.5 rounded-xl bg-flame-soft p-2 text-xs text-flame-shade">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Распознал неуверенно (
              {analysis!.cycles === 1 ? "только один повтор" : "есть сомнения"}) — Прослушай и
              поправь интервалы руками, либо Перезапиши.
            </p>
          )}
        </>
      ) : (
        <TapButton variant="soft" className="min-h-[88px] w-full" onClick={begin}>
          <span className="flex flex-col items-center gap-1 text-sm">
            <Hand className="h-6 w-6" /> Постучать ритм
            <span className="text-xs font-normal text-muted-foreground">
              Ритм будет звучать в цикле, первый удар — акцентный
            </span>
          </span>
        </TapButton>
      )}
    </div>
  );
}

const replace = (xs: number[], i: number, v: number) => xs.map((x, j) => (j === i ? v : x));
const without = (xs: number[], i: number) => xs.filter((_, j) => j !== i);

/** Number input with a local draft: clamping happens on blur so typing isn't mangled. */
function IntervalInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = +text;
    if (!text.trim() || !Number.isFinite(n)) return setText(String(value));
    onCommit(Math.min(RHYTHM.maxIntervalMs, Math.max(RHYTHM.minIntervalMs, n)));
  };
  return (
    <input
      type="number"
      inputMode="numeric"
      min={RHYTHM.minIntervalMs}
      max={RHYTHM.maxIntervalMs}
      step={10}
      className="w-24 rounded-xl border-2 border-border bg-card px-2 py-1.5 text-sm tabular outline-none focus:border-primary"
      aria-label="Интервал, мс"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}
