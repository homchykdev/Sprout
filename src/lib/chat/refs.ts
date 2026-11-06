import { uid } from "../store";

/**
 * In-memory resolution registry (the attached plan §3): every video the tools
 * verified is stored under an opaque `video_ref`; mutating tools accept ONLY
 * refs, never URLs or video IDs, so a hallucinating model cannot inject links.
 * Client-side by design — the app data layer lives client-side too.
 */
export interface VerifiedVideo {
  videoId: string;
  title: string;
  channel: string;
  durationSec: number;
  clip?: { start: number; end: number; source: "chapters" | "ai" | "whole" } | undefined;
  verifiedAt: string;
}

const TTL_MS = 30 * 60 * 1000;
const registry = new Map<string, { video: VerifiedVideo; exp: number }>();

/** Stores a verified video and returns its opaque ref (`vref-…`). Throws never. */
export function registerVideo(video: VerifiedVideo): string {
  const ref = `vref-${uid()}`;
  registry.set(ref, {
    video: { ...video, verifiedAt: video.verifiedAt || new Date().toISOString() },
    exp: Date.now() + TTL_MS,
  });
  // Opportunistic GC so a long session cannot grow unbounded.
  for (const [key, entry] of registry) {
    if (entry.exp < Date.now()) registry.delete(key);
  }
  return ref;
}

/** Returns the verified video behind a ref, or null for unknown/expired refs. */
export function resolveVideoRef(ref: unknown): VerifiedVideo | null {
  if (typeof ref !== "string" || !registry.has(ref)) return null;
  const entry = registry.get(ref)!;
  if (entry.exp < Date.now()) {
    registry.delete(ref);
    return null;
  }
  return entry.video;
}

/** Test hook: drops everything. */
export function clearVideoRefs(): void {
  registry.clear();
}
