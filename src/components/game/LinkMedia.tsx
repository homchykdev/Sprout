import { useEffect, useRef, useState } from "react";
import { parseLink, type Clip } from "@/lib/embed";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: YTPlayerOpts) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** Minimal typing for the parts of the YouTube IFrame API we use. */
interface YTPlayer {
  destroy(): void;
  playVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  mute(): void;
}
interface YTPlayerOpts {
  videoId: string;
  width: string;
  height: string;
  playerVars: Record<string, number | string>;
  events: {
    onReady: (e: { target: YTPlayer }) => void;
    onStateChange: (e: { data: number; target: YTPlayer }) => void;
    onError: (e: { data: number }) => void;
  };
}
/** getPlayerState values: https://developers.google.com/youtube/iframe_api_reference */
const YT_PLAYING = 1;
const YT_ENDED = 0;

let ytReady: Promise<NonNullable<Window["YT"]>> | null = null;
function loadYT() {
  return (ytReady ??= new Promise((res) => {
    if (window.YT?.Player) return res(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      res(window.YT!);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  }));
}

/**
 * YouTube player that loops only the given clips (in order).
 *
 * The player instance is created ONCE per video id and never recreated on
 * re-renders: clips and flags flow through refs. This avoids the reload loop
 * where a new player (and a new buffering spinner) appeared on every update.
 * The position watchdog only corrects the playhead while actually playing,
 * so a paused/buffering video is never yanked around.
 */
function YouTubeClips({
  id,
  clips,
  autoplay,
  muted,
  controls,
}: {
  id: string;
  clips: Clip[];
  autoplay: boolean;
  muted: boolean;
  controls: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const flagsRef = useRef({ autoplay, muted, controls });
  flagsRef.current = { autoplay, muted, controls };

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let dead = false;
    let player: YTPlayer | null = null;
    let i = 0;
    let clipsKey = "";
    loadYT().then((YT) => {
      if (dead || !host.current) return;
      const el = document.createElement("div");
      host.current.replaceChildren(el);
      const first = clipsRef.current;
      const origin =
        typeof window !== "undefined" && window.location.origin.startsWith("http")
          ? { origin: window.location.origin }
          : {};
      player = new YT.Player(el, {
        videoId: id,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: autoplay ? 1 : 0,
          mute: muted ? 1 : 0,
          controls: controls ? 1 : 0,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          ...origin,
          start: first.length ? Math.floor(first[0]!.start) : 0,
        },
        events: {
          onReady: (e) => {
            if (dead) return;
            if (muted) e.target.mute();
            if (first.length) e.target.seekTo(first[0]!.start, true);
            if (autoplay) e.target.playVideo();
          },
          onStateChange: (e) => {
            if (e.data !== YT_ENDED || !player) return;
            const list = clipsRef.current;
            if (list.length) {
              // Loop the clip selection (or restart it when it was a single pass).
              i = 0;
              e.target.seekTo(list[0]!.start, true);
              if (flagsRef.current.autoplay) e.target.playVideo();
            } else if (flagsRef.current.autoplay) {
              // A full video on autoplay loops from the start.
              e.target.seekTo(0, true);
              e.target.playVideo();
            }
            // A manually played full video stays stopped at the end (no forced replay).
          },
          onError: () => {
            // 101/150 = embedding disabled by the owner: show a way out instead of a dead frame.
            if (!dead) setFailed(true);
          },
        },
      });
      timer = setInterval(() => {
        if (!player) return;
        const list = clipsRef.current;
        if (!list.length) return;
        if (JSON.stringify(list) !== clipsKey) {
          clipsKey = JSON.stringify(list);
          i = 0;
        }
        let t: number, st: number;
        try {
          st = player.getPlayerState();
          if (st !== YT_PLAYING) return;
          t = player.getCurrentTime();
        } catch {
          return;
        }
        const c = list[i % list.length]!;
        if (t >= c.end) {
          i = (i + 1) % list.length;
          player.seekTo(list[i]!.start, true);
        } else if (t < c.start - 1.5) {
          player.seekTo(c.start, true);
        }
      }, 250);
    });
    return () => {
      dead = true;
      clearInterval(timer);
      try {
        player?.destroy();
      } catch {
        /* noop */
      }
      player = null;
    };
    // autoplay/muted/controls are mount-time only by design (they flow through flagsRef for events)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (failed) {
    const first = clips[0];
    const href = `https://www.youtube.com/watch?v=${id}${first ? `#t=${Math.floor(first.start)}s` : ""}`;
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted p-4 text-center">
        <p className="text-sm text-muted-foreground">Автор запретил встраивание этого видео.</p>
        <a
          className="text-sm font-semibold text-primary underline"
          href={href}
          target="_blank"
          rel="noreferrer"
        >
          Открыть на YouTube
        </a>
      </div>
    );
  }
  return <div ref={host} className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full" />;
}

/** Renders any pasted link: YouTube (with clips), Vimeo, direct video/image or generic iframe. Loads only when mounted. */
export function LinkMedia({
  url,
  clips = [],
  autoplay = true,
  muted = true,
  controls = false,
  className,
  onFail,
}: {
  url: string;
  clips?: Clip[] | undefined;
  autoplay?: boolean;
  muted?: boolean;
  controls?: boolean;
  className?: string;
  onFail?: () => void;
}) {
  const k = parseLink(url);
  const vid = useRef<HTMLVideoElement>(null);
  const [idx, setIdx] = useState(0);
  if (!k) return null;
  const box = cn("h-full w-full bg-foreground/5", className);
  if (k.type === "youtube")
    return (
      <div className={box}>
        <YouTubeClips
          id={k.id}
          clips={clips.length ? clips : k.t ? [{ start: k.t, end: 1e9 }] : []}
          autoplay={autoplay}
          muted={muted}
          controls={controls}
        />
      </div>
    );
  if (k.type === "vimeo")
    return (
      <iframe
        className={box}
        src={`https://player.vimeo.com/video/${k.id}?autoplay=${autoplay ? 1 : 0}&muted=${muted ? 1 : 0}&loop=1${clips[0] ? `#t=${Math.floor(clips[0].start)}s` : ""}`}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        title="Видео"
      />
    );
  if (k.type === "image")
    return (
      <img
        src={k.url}
        alt=""
        className={cn(box, "object-cover")}
        onError={onFail}
        referrerPolicy="no-referrer"
      />
    );
  if (k.type === "video") {
    const c = clips[idx];
    return (
      <video
        ref={vid}
        src={k.url + (c ? `#t=${c.start}` : "")}
        autoPlay={autoplay}
        muted={muted}
        controls={controls}
        loop={!clips.length}
        playsInline
        className={cn(box, "object-cover")}
        onError={onFail}
        onTimeUpdate={(e) => {
          if (c && e.currentTarget.currentTime >= c.end) {
            const n = (idx + 1) % clips.length;
            setIdx(n);
            e.currentTarget.currentTime = clips[n]!.start;
            e.currentTarget.play().catch(() => {});
          }
        }}
        onEnded={(e) => {
          if (clips.length) {
            setIdx(0);
            e.currentTarget.currentTime = clips[0]!.start;
            e.currentTarget.play().catch(() => {});
          }
        }}
      />
    );
  }
  return (
    <iframe
      className={box}
      src={k.url}
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      allowFullScreen
      referrerPolicy="no-referrer"
      title="Медиа"
    />
  );
}
