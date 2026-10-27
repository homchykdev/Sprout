import { useEffect, useState } from "react";
import { parseLink, posterFromUrl } from "@/lib/embed";
import { getMedia, useBlobUrl, type MediaItem } from "@/lib/media";
import type { Exercise } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Loads the user's uploaded exercise media (IndexedDB) by id. */
export function useExerciseMedia(id?: string) {
  const [m, setM] = useState<MediaItem | null>(null);
  useEffect(() => {
    let on = true;
    setM(null);
    if (id) getMedia(id).then((x) => on && setM(x ?? null));
    return () => {
      on = false;
    };
  }, [id]);
  return m;
}

/** Preview of an exercise: uploaded photo/video → link preview → emoji. */
export function ExerciseThumb({ ex, className }: { ex: Exercise; className?: string }) {
  const m = useExerciseMedia(ex.mediaId);
  const blobUrl = useBlobUrl(m?.blob);
  const [bad, setBad] = useState(false);
  const box = cn(
    "flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted text-2xl",
    className,
  );
  const cover = "h-full w-full object-cover";
  if (m && blobUrl)
    return (
      <span className={box}>
        {m.kind === "image" ? (
          <img src={blobUrl} alt="" className={cover} />
        ) : (
          <video src={blobUrl + "#t=0.5"} muted playsInline preload="metadata" className={cover} />
        )}
      </span>
    );
  const k = ex.videoUrl && !bad ? parseLink(ex.videoUrl) : null;
  /** Free provider poster (YouTube, Kinescope) instead of a generic emoji. */
  const poster = ex.videoUrl && !bad ? posterFromUrl(ex.videoUrl) : null;
  if (poster)
    return (
      <span className={box}>
        <img src={poster} alt="" loading="lazy" className={cover} onError={() => setBad(true)} />
      </span>
    );
  if (k?.type === "image")
    return (
      <span className={box}>
        <img
          src={k.url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className={cover}
          onError={() => setBad(true)}
        />
      </span>
    );
  if (k?.type === "video")
    return (
      <span className={box}>
        <video
          src={k.url + "#t=0.5"}
          muted
          playsInline
          preload="metadata"
          className={cover}
          onError={() => setBad(true)}
        />
      </span>
    );
  return <span className={box}>{ex.emoji || "🏋️"}</span>;
}
