/** Pure helpers for the multi-key AI setup (rotation on quota errors). */

/** Masks a key for display, keeping the last 4 chars so keys stay distinguishable. */
export const maskKey = (k: string) =>
  k.length <= 8 ? "•".repeat(Math.max(k.length, 4)) : `••••••${k.slice(-4)}`;

/** Moves the working key to the front so the next call tries it first. */
export function promoteKey(keys: string[], index: number): string[] {
  if (index <= 0 || index >= keys.length) return keys;
  return [keys[index]!, ...keys.filter((_, i) => i !== index)];
}
