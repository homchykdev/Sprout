import { Capacitor } from "@capacitor/core";
import { QueueStrategy, TextToSpeech } from "./native-tts";
import { useApp } from "./store";

let ctx: AudioContext | null = null;
const audio = () => (ctx ??= new AudioContext());

let nativeVoices: ReturnType<typeof TextToSpeech.getSupportedVoices> | undefined;
let nativeSpeechRequests = 0;
let nativeSpeechGeneration = 0;

/**
 * Web Speech keeps only weak references to utterances — an utterance without a
 * stored reference can be garbage-collected mid-speech, silently dropping the
 * audio, so we retain them until their own `onend`/`onerror` fires.
 */
const webUtterances = new Set<SpeechSynthesisUtterance>();
/**
 * Calling `cancel()` and `speak()` in the same tick wedges Chrome/Android's
 * engine after a few repeats (queue stuck "speaking", no audio). The tiny delay
 * between the two lets the engine settle, and `resume()` clears the paused
 * state `cancel()` can leave behind.
 */
const SPEAK_AFTER_CANCEL_MS = 40;

export async function listVoices(): Promise<SpeechSynthesisVoice[]> {
  if (Capacitor.isNativePlatform()) {
    try {
      nativeVoices ??= TextToSpeech.getSupportedVoices();
      let voices = (await nativeVoices).voices;
      if (!voices.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        nativeVoices = TextToSpeech.getSupportedVoices();
        voices = (await nativeVoices).voices;
      }
      return voices.filter((voice) => voice.lang.toLowerCase().startsWith("ru"));
    } catch (error) {
      nativeVoices = undefined;
      console.error("Could not load native speech voices.", error);
      return [];
    }
  }
  if (typeof speechSynthesis === "undefined") return [];
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("ru"));
}

export function speak(text: string, opts: { interrupt?: boolean } = {}) {
  const v = useApp.getState().voice;
  if (!v.enabled || v.muted) return;
  if (Capacitor.isNativePlatform()) {
    if (opts.interrupt) nativeSpeechGeneration++;
    const generation = nativeSpeechGeneration;
    void (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (generation !== nativeSpeechGeneration) return;
        let started = false;
        try {
          let voiceIndex = -1;
          if (v.voiceURI) {
            nativeVoices ??= TextToSpeech.getSupportedVoices();
            const voices = (await nativeVoices).voices;
            voiceIndex = voices.findIndex((voice) => voice.voiceURI === v.voiceURI);
          }
          if (generation !== nativeSpeechGeneration) return;
          nativeSpeechRequests++;
          started = true;
          await TextToSpeech.speak({
            text,
            lang: "ru-RU",
            rate: v.rate,
            volume: 1,
            ...(voiceIndex >= 0 ? { voice: voiceIndex } : {}),
            queueStrategy: opts.interrupt ? QueueStrategy.Flush : QueueStrategy.Add,
          });
          return;
        } catch (error) {
          nativeVoices = undefined;
          if (attempt === 0 && String(error).includes("Not yet initialized")) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          } else {
            console.error("Could not speak with the native text-to-speech engine.", error);
            return;
          }
        } finally {
          if (started) nativeSpeechRequests--;
        }
      }
    })();
    return;
  }
  if (typeof speechSynthesis === "undefined") return;
  const start = () => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ru-RU";
    u.rate = v.rate;
    const voices = speechSynthesis.getVoices().filter((x) => x.lang.toLowerCase().startsWith("ru"));
    const voice = speechSynthesis.getVoices().find((x) => x.voiceURI === v.voiceURI) ?? voices[0];
    if (voice) u.voice = voice;
    webUtterances.add(u);
    u.onend = () => webUtterances.delete(u);
    u.onerror = () => {
      webUtterances.delete(u);
      // Engine failures are otherwise invisible; nudge it out of a wedged state.
      try {
        speechSynthesis.resume();
      } catch {
        /* noop */
      }
    };
    speechSynthesis.speak(u);
  };
  if (opts.interrupt) {
    speechSynthesis.cancel();
    try {
      speechSynthesis.resume();
    } catch {
      /* noop */
    }
    setTimeout(start, SPEAK_AFTER_CANCEL_MS);
  } else {
    start();
  }
}

export function stopSpeech() {
  if (Capacitor.isNativePlatform()) {
    nativeSpeechGeneration++;
    if (!nativeSpeechRequests) return;
    void TextToSpeech.stop().catch((error: unknown) =>
      console.error("Could not stop native speech.", error),
    );
    return;
  }
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

/** Short synthesized beep. kind: tick (countdown), go (start), end (finish), metro (tempo). */
export function beep(kind: "tick" | "go" | "end" | "metro") {
  const v = useApp.getState().voice;
  if (v.muted || (!v.beeps && kind !== "metro")) return;
  try {
    const a = audio();
    if (a.state === "suspended") void a.resume();
    const o = a.createOscillator(),
      g = a.createGain();
    const cfg = { tick: [660, 0.12], go: [990, 0.25], end: [520, 0.45], metro: [1400, 0.04] }[kind];
    o.frequency.value = cfg[0]!;
    o.type = kind === "metro" ? "square" : "sine";
    const vol = v.volume * (kind === "metro" ? 0.35 : 1);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + cfg[1]!);
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + cfg[1]!);
    if (kind === "end") {
      const o2 = a.createOscillator(),
        g2 = a.createGain();
      o2.frequency.value = 780;
      g2.gain.setValueAtTime(vol, a.currentTime + 0.2);
      g2.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.7);
      o2.connect(g2).connect(a.destination);
      o2.start(a.currentTime + 0.2);
      o2.stop(a.currentTime + 0.7);
    }
  } catch {
    /* audio unavailable */
  }
}

/** Unlocks audio on iOS/Android — call from a user gesture. */
export function primeAudio() {
  try {
    void audio().resume();
  } catch {
    /* noop */
  }
}

function tone(
  a: AudioContext,
  freq: number,
  at: number,
  dur: number,
  vol: number,
  type: OscillatorType,
) {
  const o = a.createOscillator(),
    g = a.createGain();
  o.frequency.value = freq;
  o.type = type;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(a.destination);
  o.start(at);
  o.stop(at + dur + 0.05);
}

/**
 * Branded victory chords, synthesized with Web Audio (offline, no assets):
 * ascending major-triad arpeggio — the classic triumph motif, voiced per theme.
 */
export function fanfare(kind: "set" | "workout") {
  const v = useApp.getState().voice;
  if (v.muted || !v.beeps) return;
  try {
    const a = audio();
    if (a.state === "suspended") void a.resume();
    const wave: OscillatorType =
      v.theme === "triumph" ? "sawtooth" : v.theme === "calm" ? "sine" : "triangle";
    const vol = v.volume * (v.theme === "triumph" ? 0.3 : 0.5);
    const t = a.currentTime;
    if (kind === "set") {
      // Bright two-note lift: root → fifth.
      const lift = v.theme === "calm" ? [659.25, 987.77] : [880, 1318.51];
      tone(a, lift[0]!, t, 0.18, vol, wave);
      tone(a, lift[1]!, t + 0.11, 0.32, vol, wave);
      return;
    }
    // Workout victory: C–E–G–C arpeggio + long tonic, octave per theme.
    const seq =
      v.theme === "triumph"
        ? [261.63, 329.63, 392.0, 523.25, 659.25]
        : v.theme === "calm"
          ? [392.0, 493.88, 587.33, 783.99]
          : [523.25, 659.25, 783.99, 1046.5];
    seq.forEach((f, i) => tone(a, f, t + i * 0.11, 0.34, vol, wave));
    tone(a, seq[0]! * 2, t + seq.length * 0.11, 0.9, vol * 0.9, wave);
    tone(a, seq[1]! * 2, t + seq.length * 0.11, 0.9, vol * 0.5, wave);
  } catch {
    /* audio unavailable */
  }
}
