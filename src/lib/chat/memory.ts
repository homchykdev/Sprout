import { MAX_MEMORY_FACTS } from "./types";

/**
 * Structured memory about the user: short self-contained facts, hard-capped so
 * the system prompt never balloons. Newest wins; duplicates ignored caselessly.
 */
export function mergeFacts(
  current: string[],
  learn: string[] | undefined,
  forget: string[] | undefined,
): string[] {
  let out = [...current];
  const key = (f: string) => f.trim().toLowerCase();
  if (forget?.length) {
    const drop = new Set(forget.map(key).filter(Boolean));
    out = out.filter((f) => !drop.has(key(f)));
  }
  if (learn?.length) {
    for (const raw of learn) {
      const fact = raw.trim().slice(0, 90);
      if (!fact || out.some((f) => key(f) === key(fact))) continue;
      out.push(fact);
    }
  }
  // Hard cap: the oldest facts roll out first.
  return out.slice(-MAX_MEMORY_FACTS);
}
