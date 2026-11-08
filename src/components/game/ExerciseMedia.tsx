import { useEffect, useState } from "react";
import { LinkMedia } from "@/components/game/LinkMedia";
import { signedVideo } from "@/lib/clients";
import { useExerciseMedia } from "@/components/game/ExerciseThumb";
import { useBlobUrl } from "@/lib/media";
import { parseLink } from "@/lib/embed";
import type { Exercise } from "@/lib/types";

/**
 * The exercise's media in a fixed 4:3 frame: own upload → embedded link →
 * hosted file (signed) → emoji fallback. Shared by the player and the full view.
 */
export function ExerciseMedia({ ex }: { ex: Exercise }) {
  const own = useExerciseMedia(ex.mediaId);
  const ownUrl = useBlobUrl(own?.blob);
  if (own && ownUrl)
    return (
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl bg-muted">
        {own.kind === "image" ? (
          <img src={ownUrl} alt={ex.name} className="h-full w-full object-cover" />
        ) : (
          <video
            src={ownUrl}
            autoPlay
            muted
            loop
            playsInline
            className="h-full w-full object-cover"
          />
        )}
      </div>
    );
  const link = ex.videoUrl ? parseLink(ex.videoUrl) : null;
  if (link && link.type !== "video")
    return (
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl bg-muted">
        <LinkMedia url={ex.videoUrl!} clips={ex.clips} />
      </div>
    );
  return <FileMedia ex={ex} />;
}

function FileMedia({ ex }: { ex: Exercise }) {
  const [src, setSrc] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let on = true;
    setSrc(undefined);
    setFailed(false);
    signedVideo(ex.videoUrl)
      .then((u) => on && setSrc(u))
      .catch(() => on && setFailed(true));
    return () => {
      on = false;
    };
  }, [ex.videoUrl]);
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl bg-muted">
      {src && !failed ? (
        <LinkMedia url={src} clips={ex.clips} onFail={() => setFailed(true)} />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2">
          <span className="animate-float text-8xl">{ex.emoji ?? "🏋️"}</span>
          {ex.videoUrl && (
            <span className="text-xs text-muted-foreground">
              {failed ? "Видео недоступно" : "Загрузка видео…"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
