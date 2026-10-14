import { useEffect, useRef, useState } from "react";
import { parseLink, type Clip } from "@/lib/embed";
import { cn } from "@/lib/utils";

declare global {
  interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void }
}
let ytReady: Promise<any> | null = null;
function loadYT() {
  return (ytReady ??= new Promise((res) => {
    if (window.YT?.Player) return res(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); res(window.YT); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  }));
}

/** YouTube player that loops only the given clips (in order). */
function YouTubeClips({ id, clips, autoplay, muted, controls }: { id: string; clips: Clip[]; autoplay: boolean; muted: boolean; controls: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const key = JSON.stringify(clips);
  useEffect(() => {
    let player: any, timer: ReturnType<typeof setInterval> | undefined, dead = false, i = 0;
    const list = clips.length ? clips : null;
    loadYT().then((YT) => {
      if (dead || !host.current) return;
      const el = document.createElement("div");
      host.current.replaceChildren(el);
      player = new YT.Player(el, {
        videoId: id, host: "https://www.youtube-nocookie.com",
        width: "100%", height: "100%",
        playerVars: { autoplay: autoplay ? 1 : 0, mute: muted ? 1 : 0, controls: controls ? 1 : 0, playsinline: 1, rel: 0, modestbranding: 1, start: list ? Math.floor(list[0]!.start) : 0 },
        events: {
          onReady: (e: any) => { if (muted) e.target.mute(); if (list) e.target.seekTo(list[0]!.start, true); if (autoplay) e.target.playVideo(); },
          onStateChange: (e: any) => { if (e.data === 0) { if (list) { i = 0; player.seekTo(list[0]!.start, true); } else player.seekTo(0, true); player.playVideo(); } },
        },
      });
      if (list) timer = setInterval(() => {
        const t = player?.getCurrentTime?.();
        if (typeof t !== "number") return;
        const c = list[i]!;
        if (t >= c.end || t < c.start - 1.5) { i = t >= c.end ? (i + 1) % list.length : i; player.seekTo(list[i]!.start, true); }
      }, 250);
    });
    return () => { dead = true; clearInterval(timer); try { player?.destroy(); } catch { /* noop */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key, autoplay, muted, controls]);
  return <div ref={host} className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full" />;
}

/** Renders any pasted link: YouTube (with clips), Vimeo, direct video/image or generic iframe. Loads only when mounted. */
export function LinkMedia({ url, clips = [], autoplay = true, muted = true, controls = false, className, onFail }: {
  url: string; clips?: Clip[] | undefined; autoplay?: boolean; muted?: boolean; controls?: boolean; className?: string; onFail?: () => void;
}) {
  const k = parseLink(url);
  const vid = useRef<HTMLVideoElement>(null);
  const [idx, setIdx] = useState(0);
  if (!k) return null;
  const box = cn("h-full w-full bg-foreground/5", className);
  if (k.type === "youtube") return <div className={box}><YouTubeClips id={k.id} clips={clips.length ? clips : k.t ? [{ start: k.t, end: 1e9 }] : []} autoplay={autoplay} muted={muted} controls={controls} /></div>;
  if (k.type === "vimeo") return <iframe className={box} src={`https://player.vimeo.com/video/${k.id}?autoplay=${autoplay ? 1 : 0}&muted=${muted ? 1 : 0}&loop=1${clips[0] ? `#t=${Math.floor(clips[0].start)}s` : ""}`} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen title="Видео" />;
  if (k.type === "image") return <img src={k.url} alt="" className={cn(box, "object-cover")} onError={onFail} referrerPolicy="no-referrer" />;
  if (k.type === "video") {
    const c = clips[idx];
    return (
      <video ref={vid} src={k.url + (c ? `#t=${c.start}` : "")} autoPlay={autoplay} muted={muted} controls={controls} loop={!clips.length} playsInline className={cn(box, "object-cover")} onError={onFail}
        onTimeUpdate={(e) => { if (c && e.currentTarget.currentTime >= c.end) { const n = (idx + 1) % clips.length; setIdx(n); e.currentTarget.currentTime = clips[n]!.start; e.currentTarget.play().catch(() => {}); } }}
        onEnded={(e) => { if (clips.length) { setIdx(0); e.currentTarget.currentTime = clips[0]!.start; e.currentTarget.play().catch(() => {}); } }} />
    );
  }
  return <iframe className={box} src={k.url} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="no-referrer" title="Медиа" />;
}
