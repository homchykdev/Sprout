import { useApp } from "./store";

let ctx: AudioContext | null = null;
const audio = () => (ctx ??= new AudioContext());

export function listVoices() {
  if (typeof speechSynthesis === "undefined") return [];
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("ru"));
}

export function speak(text: string, opts: { interrupt?: boolean } = {}) {
  const v = useApp.getState().voice;
  if (!v.enabled || v.muted || typeof speechSynthesis === "undefined") return;
  if (opts.interrupt) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ru-RU";
  u.rate = v.rate;
  const voice = speechSynthesis.getVoices().find((x) => x.voiceURI === v.voiceURI) ?? listVoices()[0];
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

export function stopSpeech() {
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

/** Short synthesized beep. kind: tick (countdown), go (start), end (finish), metro (tempo). */
export function beep(kind: "tick" | "go" | "end" | "metro") {
  const v = useApp.getState().voice;
  if (v.muted || (!v.beeps && kind !== "metro")) return;
  try {
    const a = audio();
    if (a.state === "suspended") void a.resume();
    const o = a.createOscillator(), g = a.createGain();
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
      const o2 = a.createOscillator(), g2 = a.createGain();
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
  try { void audio().resume(); } catch { /* noop */ }
}
