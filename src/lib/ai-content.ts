/**
 * Normalizes an AI provider's message content into a plain string.
 *
 * OpenAI-compatible servers may return `content` as an array of content parts
 * (`[{type:"text",text:"..."}]`) or a single part object instead of a string;
 * feeding such a value to string methods crashes with
 * "TypeError: r.replace is not a function" in the minified bundle.
 * Unknown shapes normalize to "" so callers raise a clean Russian error instead.
 */
export function normalizeAiContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(contentPartText).join("");
  return contentPartText(content);
}

function contentPartText(part: unknown): string {
  if (typeof part === "string") return part;
  if (part !== null && typeof part === "object" && "text" in part) {
    const text = (part as { text: unknown }).text;
    if (typeof text === "string") return text;
  }
  return "";
}
