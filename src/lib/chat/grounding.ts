import type { Candidate } from "@google/genai";
import type { ChatSource } from "./types";

const MAX_SOURCES = 8;

function source(uri: string | undefined, title?: string): ChatSource | null {
  const url = uri?.trim();
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return { title: title?.trim().slice(0, 160) || parsed.hostname, url };
  } catch {
    return null;
  }
}

/** Returns only HTTPS URLs explicitly returned by Google Search grounding metadata. */
export function extractGroundedSources(candidate: Candidate | undefined): ChatSource[] {
  if (!candidate) return [];

  const groundingSources =
    candidate.groundingMetadata?.groundingChunks?.flatMap((chunk) => {
      const item = source(chunk.web?.uri, chunk.web?.title);
      return item ? [item] : [];
    }) ?? [];

  const unique = new Map<string, ChatSource>();
  for (const item of groundingSources) {
    if (!unique.has(item.url)) unique.set(item.url, item);
    if (unique.size === MAX_SOURCES) break;
  }
  return [...unique.values()];
}
