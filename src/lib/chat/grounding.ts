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

/** Returns HTTPS URLs from Google Search grounding and verified YouTube URLs from URL Context. */
export function extractGroundedSources(candidate: Candidate | undefined): ChatSource[] {
  if (!candidate) return [];

  const sources: ChatSource[] = [];

  // Google Search grounding sources
  const groundingSources =
    candidate.groundingMetadata?.groundingChunks?.flatMap((chunk) => {
      const item = source(chunk.web?.uri, chunk.web?.title);
      return item ? [item] : [];
    }) ?? [];

  for (const item of groundingSources) {
    if (!sources.some((s) => s.url === item.url)) {
      sources.push(item);
    }
    if (sources.length === MAX_SOURCES) break;
  }

  // URL Context verified sources (e.g., YouTube URLs the model was given and verified)
  // Use type assertion since SDK types may not include urlContextMetadata yet
  if (sources.length < MAX_SOURCES) {
    const gm = candidate.groundingMetadata as
      | {
          urlContextMetadata?: {
            urlMetadata?: Array<{
              retrievedUrl?: string;
              title?: string;
              urlRetrievalStatus?: string;
            }>;
          };
        }
      | undefined;

    const urlContextSources =
      gm?.urlContextMetadata?.urlMetadata
        ?.filter((m) => m.urlRetrievalStatus === "URL_RETRIEVAL_STATUS_SUCCESS")
        .flatMap((m) => {
          const item = source(m.retrievedUrl, m.title);
          return item ? [item] : [];
        }) ?? [];

    for (const item of urlContextSources) {
      if (!sources.some((s) => s.url === item.url)) {
        sources.push(item);
      }
      if (sources.length === MAX_SOURCES) break;
    }
  }

  return sources;
}
