import { getAudioContext } from "./voice";
import { useApp } from "./store";

/** Shared invariants so the editor UI and the player validate the same way. */
export const RHYTHM = {
  /** Taps closer than this are a finger bounce / ghost click, not a beat. */
  tapDebounceMs: 45,
  /** Shortest storable interval; also the floor for every edited value. */
  minIntervalMs: 60,
  /** Longest storable interval; gaps longer than this end the recording session. */
  maxIntervalMs: 5000,
  /** Hard cap on pattern length to keep UI and playback sane. */
  maxIntervals: 32,
  /** Saved values are snapped to this grid just to avoid 201.333… noise. */
  snapMs: 10,
} as const;

/** Analysis of a tap session: normalized intervals + how confident the detector is. */
export interface TapAnalysis {
  /** Averaged ms between consecutive beats inside one cycle. */
  intervals: number[];
  /** Full cycle length (sum of intervals), ms. */
  cycleMs: number;
  /** How many full repeats were tapped (1 = no repetition proven). */
  cycles: number;
  /** Detector had thin evidence — UI asks the user to double-check / tap more. */
  unstable: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const median = (nums: number[]) => {
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)]!;
};

/** Full cycle length (sum of intervals), ms — used by the editor UI and hints. */
export const cycleTime = (intervals: number[]) => intervals.reduce((a, b) => a + b, 0);

/**
 * Drops bounce/ghost taps: any tap closer than `tapDebounceMs` to its predecessor
 * is merged away. Input must be ordered timestamps (performance.now()); output is
 * the cleaned tap list (empty if fewer than 2 real taps).
 */
export function sanitizeTaps(taps: number[]): number[] {
  const out: number[] = [];
  for (const t of [...taps].sort((a, b) => a - b)) {
    if (t - (out[out.length - 1] ?? -Infinity) < RHYTHM.tapDebounceMs) continue;
    out.push(t);
  }
  return out;
}

/**
 * The core detector. Takes cleaned tap timestamps and finds the smallest repeating
 * period in the gap sequence (`gaps[i] ≈ gaps[i+k]`), then averages each slot
 * across all tapped cycles to smooth finger noise.
 *
 * Gap periodicity is used instead of "all taps sit on a multiple of p" on purpose:
 * a 0.2/0.2/1s pattern also lands perfectly on a 200ms grid, and the dot-grid
 * criterion would mis-detect a plain 200 bpm steam (aliasing).
 *
 * `unstable` (and `cycles <= 1`) means the evidence is thin — the trailing gap of
 * the cycle is unknown in that case, so the UI shows a warning and manual editing.
 */
export function analyzeTaps(tapsMs: number[]): TapAnalysis | null {
  const taps = sanitizeTaps(tapsMs);
  const gaps: number[] = [];
  for (let i = 1; i < taps.length; i++) gaps.push(taps[i]! - taps[i - 1]!);
  if (!gaps.length) return null;

  // Tolerance scale-free-ish: fast taps get a strict tolerance, slow ones a loose one.
  const tol = clamp(Math.round(median(gaps) * 0.15), 25, 90);
  const snap = (v: number) => Math.round(v / RHYTHM.snapMs) * RHYTHM.snapMs;

  // The smallest period k whose gap sequence repeats within tolerance wins.
  // Diffs are averaged per-slot afterwards, so a passing k must repeat ≥1 full cycle.
  let bestK = -1;
  let clean = true;
  for (let k = 1; k <= Math.floor(gaps.length / 2); k++) {
    let within = 0;
    for (let i = 0; i + k < gaps.length; i++) {
      if (Math.abs(gaps[i]! - gaps[i + k]!) <= tol) within++;
    }
    const pairs = gaps.length - k;
    if (pairs > 0 && within / pairs >= 0.9) {
      bestK = k;
      clean = within === pairs;
      break;
    }
  }

  const intervals: number[] = [];
  let cycles = 1;
  let unstable = true;
  if (bestK >= 1) {
    // Full repeats need gaps.length >= bestK * 2 (the comparison window above).
    cycles = gaps.length >= bestK * 2 ? Math.floor(gaps.length / bestK) : 1;
    unstable = !clean || cycles < 2;
    // Average slot k over every cycle that supplies both of its edge gaps.
    for (let slot = 0; slot < bestK; slot++) {
      const samples: number[] = [];
      for (let c = 0; c * bestK + slot < gaps.length; c++) {
        const idx = c * bestK + slot;
        if (idx + bestK < gaps.length) samples.push(gaps[idx]!);
      }
      if (samples.length) intervals.push(snap(median(samples)));
    }
  } else {
    // Single cycle: cannot know the trailing gap — keep raw gaps, flag unstable.
    intervals.push(...gaps.slice(0, RHYTHM.maxIntervals - 1).map(snap));
    cycles = 1;
    unstable = true;
  }
  return { intervals: clampIntervals(intervals), cycleMs: cycleTime(intervals), cycles, unstable };
}

/** Validates/clamps an explicit (manually edited) interval list for storage/playback.
 *  Out-of-range values are clamped (a dropped beat would shift the whole pattern). */
export function sanitizeRhythm(intervals: number[]): number[] | undefined {
  const out = clampIntervals(
    intervals
      .filter((v) => Number.isFinite(v))
      .slice(0, RHYTHM.maxIntervals)
      .map((v) => Math.round(v / RHYTHM.snapMs) * RHYTHM.snapMs),
  );
  return out.length ? out : undefined;
}

const clampIntervals = (xs: number[]) =>
  xs.map((v) => clamp(v, RHYTHM.minIntervalMs, RHYTHM.maxIntervalMs));

/** "1,4 с" — ru-formatted seconds for badges and hints. */
export const formatSec = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} с`;

/** "~19 уд/мин" hint next to the cycle length — mean beat pace of the pattern. */
export function impliedBpm(intervals: number[]): number | null {
  if (!intervals.length) return null;
  return Math.round(60000 / (cycleTime(intervals) / intervals.length));
}

export interface RhythmPlayer {
  start(): void;
  stop(): void;
}

const LOOKAHEAD_SEC = 0.25;
const TICK_MS = 50;
const tickCfg = {
  acc: { freq: 1050, vol: 1.6, dur: 0.07 },
  beat: { freq: 1400, vol: 0.9, dur: 0.04 },
};

/**
 * Drift-free looping rhythm player. Beats are scheduled on the AudioContext clock
 * up to 250ms ahead (a plain setInterval would drift across uneven gaps like 0.2/0.2/1).
 * `onBeat(slot)` fires when a scheduled beat is heard — used for the visual pulse.
 * Accented tone on slot 0 (the first beat of each loop), gated off by the caller
 * via the same voice settings as the bpm metronome.
 */
export function createRhythmPlayer(opts: {
  intervals: number[];
  onBeat?: ((slot: number) => void) | undefined;
}): RhythmPlayer {
  const intervals = sanitizeRhythm(opts.intervals) ?? [];
  const n = intervals.length;
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let nextAt = 0;
  let beat = 0;

  const scheduleNext = () => {
    const a = getAudioContext();
    if (a.state === "suspended") void a.resume();
    while (nextAt < a.currentTime + LOOKAHEAD_SEC && n) {
      const slot = beat % n;
      const acc = slot === 0;
      const cfg = acc ? tickCfg.acc : tickCfg.beat;
      const v = useApp.getState().voice;
      // Built here instead of voice.tone() so stop() can cancel already-scheduled tones.
      const stopAt = nextAt + cfg.dur;
      const o = a.createOscillator();
      const g = a.createGain();
      o.frequency.value = cfg.freq;
      o.type = "square";
      g.gain.setValueAtTime(0.0001, nextAt);
      g.gain.exponentialRampToValueAtTime(
        Math.max(0.0002, v.volume * 0.35 * cfg.vol),
        nextAt + 0.015,
      );
      g.gain.exponentialRampToValueAtTime(0.0001, stopAt);
      o.connect(g).connect(a.destination);
      o.start(nextAt);
      o.stop(stopAt + 0.05);
      const src = { o, stopAt };
      played.push(src);
      const at = (nextAt - a.currentTime) * 1000;
      const slotRef = slot;
      const t = setTimeout(
        () => {
          timeouts.delete(t);
          opts.onBeat?.(slotRef);
        },
        Math.max(0, at),
      );
      timeouts.add(t);
      beat++;
      nextAt += intervals[slot]! / 1000;
    }
    // Trim already-played oscillators to keep the list small.
    while (played.length && played[0]!.stopAt < a.currentTime) played.shift();
  };

  const played: { o: OscillatorNode; stopAt: number }[] = [];

  return {
    start() {
      if (timer || !n) return;
      beat = 0;
      nextAt = getAudioContext().currentTime + 0.12;
      timer = setInterval(scheduleNext, TICK_MS);
      scheduleNext();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      timeouts.forEach(clearTimeout);
      timeouts.clear();
      for (const src of played) {
        try {
          src.o.stop();
        } catch {
          /* already stopped */
        }
      }
      played.length = 0;
    },
  };
}
