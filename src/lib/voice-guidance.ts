const GUIDANCE_REPEAT_INTERVAL = 6_000;

export interface VoiceGuidance {
  update(prompt: string): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

export function createVoiceGuidance(announce: (prompt: string) => void): VoiceGuidance {
  let prompt: string | null = null;
  let paused = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const startRepeating = () => {
    if (paused || !prompt || timer) return;
    timer = setInterval(() => {
      if (prompt && !paused) announce(prompt);
    }, GUIDANCE_REPEAT_INTERVAL);
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
    stop() {
      pause();
      prompt = null;
    },
  };
}
