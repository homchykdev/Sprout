import { logDebug } from "../logger";

/**
 * Token-budget guard for free-tier Gemini (plan §8). Numbers are estimates —
 * the goal is to skip expensive video ANALYSIS when the window/day is nearly
 * spent, not to be billing-accurate. No hard-coded model of real usage.
 */
export interface LlmBudgetConfig {
  /** Requests sliding window size, ms. */
  windowMs: number;
  /** Requests allowed within the window. */
  maxPerWindow: number;
  /** Suggested margin: real cap x (1 - safety). */
  safety: number;
  /** Daily estimated-token cap (RPM/TPM free tier ≈ 250k tokens → video ≈ 300 tokens/s). */
  maxTokensPerDay: number;
}

export const DEFAULT_BUDGET: LlmBudgetConfig = {
  windowMs: 60_000,
  maxPerWindow: 15,
  safety: 0.8,
  maxTokensPerDay: 200_000,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export class LlmBudget {
  private stamps: number[] = [];
  private tokens: { day: string; value: number } = { day: "", value: 0 };

  constructor(private config: LlmBudgetConfig = DEFAULT_BUDGET) {}

  /** Tries to reserve one model request; false when the window is full. */
  tryRequest(): boolean {
    const now = Date.now();
    this.stamps = this.stamps.filter((t) => now - t < this.config.windowMs);
    const limit = Math.floor(this.config.maxPerWindow * this.config.safety);
    if (this.stamps.length >= limit) {
      logDebug("llm", "Окно запросов исчерпано", { per: this.stamps.length, limit });
      return false;
    }
    this.stamps.push(now);
    return true;
  }

  /** Reserves an estimated amount of tokens for the current day; false when the cap is hit. */
  tryTokens(estimate: number): boolean {
    const today = new Date().toISOString().slice(0, 10);
    if (this.tokens.day !== today) this.tokens = { day: today, value: 0 };
    if (this.tokens.value + estimate > this.config.maxTokensPerDay) {
      logDebug("llm", "Дневной бюджет токенов исчерпан", { value: this.tokens.value, estimate });
      return false;
    }
    this.tokens.value += Math.max(0, estimate);
    return true;
  }

  /** Current-day estimated token spend (for UI/messages). */
  dayTokensUsed(): number {
    const today = new Date().toISOString().slice(0, 10);
    return this.tokens.day === today ? this.tokens.value : 0;
  }
}

/** Module singleton shared by every Gemini call in the client session. */
export const llmBudget = new LlmBudget();
