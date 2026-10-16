import { Check, ImageOff, ImagePlus, Link2, Play } from "lucide-react";
import { useState } from "react";
import { parseLink, ytThumb } from "@/lib/embed";
import { useBlobUrl, type MediaItem } from "@/lib/media";
import { cn } from "@/lib/utils";

interface TileProps {
  m: MediaItem;
  onClick?: () => void;
  className?: string;
  big?: boolean;
  /** Selection mode: tapping toggles instead of opening. */
  selectMode?: boolean;
  selected?: boolean;
}

export function PhotoTile({ m, onClick, className, big, selectMode, selected }: TileProps) {
  const url = useBlobUrl(m.blob);
  const [broken, setBroken] = useState(false);
  const Tag = onClick ? "button" : "div";
  const box = cn(
    "press relative overflow-hidden rounded-2xl bg-muted",
    big && "aspect-[3/4] w-full",
    selected && "ring-4 ring-primary",
    className,
  );
  const check = selectMode && (
    <span
      className={cn(
        "absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full border-2",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-card bg-foreground/50 text-background",
      )}
      aria-hidden
    >
      {selected && <Check className="h-4 w-4" strokeWidth={3} />}
    </span>
  );
  if (m.url) {
    return (
      <Tag onClick={onClick} className={box} aria-pressed={selectMode ? selected : undefined}>
        <LinkThumb url={m.url} />
        <span className="absolute left-1.5 top-1.5 rounded-full bg-foreground/60 p-1 text-background">
          <Link2 className="h-3 w-3" />
        </span>
        {check}
        {big && m.title && (
          <span className="absolute inset-x-0 bottom-0 bg-foreground/50 px-2 py-1.5 text-left text-xs font-semibold text-background">
            {m.title}
          </span>
        )}
      </Tag>
    );
  }
  if (!m.blob) {
    return (
      <Tag onClick={onClick} className={box} aria-label="Файл отсутствует на устройстве">
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-muted-foreground">
          <ImageOff className="h-8 w-8" />
          <span className="text-[11px] font-semibold">Файл не найден — загрузи заново</span>
        </div>
        {check}
      </Tag>
    );
  }
  if (broken) {
    return (
      <Tag onClick={onClick} className={box} aria-label="Не удалось показать файл">
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-muted-foreground">
          <ImageOff className="h-8 w-8" />
          <span className="text-[11px] font-semibold">
            Не удалось показать — формат не поддерживается
          </span>
        </div>
        {check}
      </Tag>
    );
  }
  if (!url) {
    return (
      <div className={cn(box, "animate-pulse")} aria-label="Загрузка фото">
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <ImagePlus className="h-8 w-8 opacity-40" />
        </div>
      </div>
    );
  }
  return (
    <Tag onClick={onClick} className={box} aria-pressed={selectMode ? selected : undefined}>
      {m.kind === "image" ? (
        <img
          src={url}
          alt={m.title}
          loading="lazy"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <video
          src={url + "#t=0.1"}
          muted
          playsInline
          preload="metadata"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      )}
      {m.kind === "video" && (
        <span className="absolute bottom-1.5 right-1.5 rounded-full bg-foreground/60 p-1 text-background">
          <Play className="h-3 w-3" fill="currentColor" />
        </span>
      )}
      {check}
      {big && m.title && (
        <span className="absolute inset-x-0 bottom-0 bg-foreground/50 px-2 py-1.5 text-left text-xs font-semibold text-background">
          {m.title}
        </span>
      )}
    </Tag>
  );
}

function LinkThumb({ url }: { url: string }) {
  const k = parseLink(url);
  if (k?.type === "youtube")
    return <img src={ytThumb(k.id)} alt="" loading="lazy" className="h-full w-full object-cover" />;
  if (k?.type === "image")
    return (
      <img
        src={k.url}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className="h-full w-full object-cover"
      />
    );
  return (
    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
      <Link2 className="h-8 w-8" />
    </div>
  );
}
