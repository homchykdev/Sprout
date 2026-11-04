const DEFAULT_REPEAT_MS = 6_000;

export interface VoiceGuidanceOptions {
  /** Pause between repeated announcements of the same prompt. Default 6000 ms. */
  repeatMs?: number;
}

export interface VoiceGuidance {
  update(prompt: string): void;
  pause(): void;
  resume(): void;
  stop(): void;
  /** Says the current prompt again and restarts the timer (recovery after camera restart etc.). */
  reannounce(): void;
  /** The latest prompt, or null when stopped. */
  getPrompt(): string | null;
}

export function createVoiceGuidance(
  announce: (prompt: string) => void,
  { repeatMs = DEFAULT_REPEAT_MS }: VoiceGuidanceOptions = {},
): VoiceGuidance {
  let prompt: string | null = null;
  let paused = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const startRepeating = () => {
    if (paused || !prompt || timer) return;
    timer = setInterval(() => {
      if (prompt && !paused) announce(prompt);
    }, repeatMs);
  };

  const pause = () => {
    paused = true;
    if (timer) clearInterval(timer);
    timer = null;
  };

  return {
    update(nextPrompt) {
      if (!nextPrompt || nextPrompt === prompt) return;
      prompt = nextPrompt;
      if (!paused) announce(prompt);
      startRepeating();
    },
    pause,
    resume() {
      if (!paused) return;
      paused = false;
      if (prompt) announce(prompt);
      startRepeating();
    },
    reannounce() {
      if (!prompt || paused) return;
      announce(prompt);
      startRepeating();
    },
    getPrompt() {
      return prompt;
    },
    stop() {
      pause();
      prompt = null;
    },
  };
}
