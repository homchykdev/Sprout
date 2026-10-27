/** Pure helpers for link-based media (YouTube, Vimeo, direct files, any iframe). */
export type Clip = { start: number; end: number };
export type LinkKind =
  | { type: "youtube"; id: string; t?: number }
  | { type: "vimeo"; id: string }
  | { type: "video"; url: string }
  | { type: "image"; url: string }
  | { type: "iframe"; url: string };

export function parseLink(raw: string): LinkKind | null {
  const s = raw.trim();
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  const t = u.searchParams.get("t") ?? u.searchParams.get("start");
  const tt = t ? (parseTime(t.replace(/s$/, "")) ?? undefined) : undefined;
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    if (id) return { type: "youtube", id, ...(tt != null && { t: tt }) };
  }
  if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    const id =
      u.searchParams.get("v") ?? u.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]+)/)?.[1];
    if (id) return { type: "youtube", id, ...(tt != null && { t: tt }) };
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = u.pathname.match(/(\d+)/)?.[1];
    if (id) return { type: "vimeo", id };
  }
  if (/\.(mp4|webm|mov|m4v|ogg)$/i.test(u.pathname)) return { type: "video", url: s };
  if (/\.(jpe?g|png|gif|webp|avif)$/i.test(u.pathname)) return { type: "image", url: s };
  return { type: "iframe", url: s };
}

/** "1:20", "01:02:03", "80" → seconds. */
export function parseTime(s: string): number | null {
  const p = s.trim().split(":");
  if (!p.length || p.length > 3 || p.some((x) => !/^\d+(\.\d+)?$/.test(x))) return null;
  return p.reduce((a, x) => a * 60 + Number(x), 0);
}
export const fmtTime = (n: number) => {
  const h = Math.floor(n / 3600),
    m = Math.floor((n % 3600) / 60),
    sec = Math.floor(n % 60);
  return (
    (h ? `${h}:${String(m).padStart(2, "0")}` : String(m)) + ":" + String(sec).padStart(2, "0")
  );
};

/** One clip per line: "1:20-1:45" (also "1:20 – 1:45"). Invalid lines skipped. */
export function parseClips(text: string): Clip[] {
  return text.split(/\n|,|;/).flatMap((line) => {
    const m = line.split(/\s*[-–—]\s*/);
    if (m.length !== 2) return [];
    const a = parseTime(m[0]!),
      b = parseTime(m[1]!);
    return a != null && b != null && b > a ? [{ start: a, end: b }] : [];
  });
}
export const clipsToText = (c?: Clip[]) =>
  (c ?? []).map((x) => `${fmtTime(x.start)}-${fmtTime(x.end)}`).join("\n");

export const ytThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
