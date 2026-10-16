import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ImageOff, X } from "lucide-react";
import { useBlobUrl, type MediaItem } from "@/lib/media";
import { cn } from "@/lib/utils";
import { LinkMedia } from "./LinkMedia";

interface Props {
  items: MediaItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}

const fmtDay = (d: string) =>
  new Date(d + "T00:00").toLocaleDateString("ru", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/**
 * Full-screen swipe gallery: finger swipe (25% width threshold),
 * desktop arrows, keyboard ←/→/Esc. Videos are paged with arrows
 * (swipe over a video is ignored so controls keep working).
 */
export function PhotoLightbox({ items, index, onIndex, onClose }: Props) {
  const [drag, setDrag] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const start = useRef<number | null>(null);
  const view = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);
  const calm =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const cur = items[Math.min(index, items.length - 1)]!;
  const go = (d: number) => onIndex(Math.min(items.length - 1, Math.max(0, index + d)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, items.length]);

  const down = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as HTMLElement).closest("video,button,a")) return;
    start.current = e.clientX;
    setDrag(0);
  };
  const move = (e: React.PointerEvent) => {
    if (start.current == null) return;
    setDrag(e.clientX - start.current);
  };
  const up = () => {
    if (start.current == null) return;
    const dx = drag ?? 0;
    const w = view.current?.clientWidth ?? 1;
    if (dx < -w * 0.25) go(1);
    else if (dx > w * 0.25) go(-1);
    start.current = null;
    setDrag(null);
  };

  // Portal out of <main class="animate-rise">: its permanent
  // translateY(0) transform would otherwise trap `fixed` inside the tab.
  if (!mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex flex-col bg-black/95 text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр фото"
    >
      <div className="flex items-center gap-2 px-4 pt-[env(safe-area-inset-top)]">
        <p className="flex-1 py-3 text-center text-sm font-semibold tabular">
          {index + 1} / {items.length}
        </p>
        <button
          aria-label="Закрыть"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"
        >
          <X className="h-6 w-6" />
        </button>
      </div>
      <div
        ref={view}
        className="relative min-h-0 flex-1 overflow-hidden [touch-action:pan-y]"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <div
          className={cn(
            "flex h-full",
            drag == null && !calm && "transition-transform duration-200 ease-out",
          )}
          style={{ transform: `translateX(calc(${-index * 100}% + ${drag ?? 0}px))` }}
        >
          {items.map((m) => (
            <div
              key={m.id}
              className="flex h-full w-full shrink-0 items-center justify-center px-2"
            >
              <Slide m={m} active={m.id === cur.id} />
            </div>
          ))}
        </div>
        {index > 0 && (
          <button
            aria-label="Предыдущее фото"
            onClick={() => go(-1)}
            className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {index < items.length - 1 && (
          <button
            aria-label="Следующее фото"
            onClick={() => go(1)}
            className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>
      <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 text-center">
        <p className="truncate font-semibold">
          {cur.title || (cur.kind === "video" ? "Видео" : "Фото")}
        </p>
        <p className="text-xs text-white/60">
          {fmtDay(cur.date)}
          {cur.note ? ` · ${cur.note}` : ""}
        </p>
      </div>
    </div>,
    document.body,
  );
}

function Slide({ m, active }: { m: MediaItem; active: boolean }) {
  const url = useBlobUrl(active ? m.blob : undefined);
  if (m.url) {
    return (
      <div className="aspect-video w-full max-w-3xl overflow-hidden rounded-xl">
        <LinkMedia url={m.url} clips={m.clips} controls muted={false} />
      </div>
    );
  }
  if (!m.blob)
    return (
      <div className="flex aspect-[3/4] max-h-full flex-col items-center justify-center gap-2 rounded-xl bg-white/10 p-6 text-center text-white/60">
        <ImageOff className="h-10 w-10" />
        <p className="text-sm font-semibold">Файл отсутствует на устройстве</p>
      </div>
    );
  if (!url)
    return (
      <div
        className="aspect-[3/4] max-h-full w-auto animate-pulse rounded-xl bg-white/10"
        aria-label="Загрузка фото"
      />
    );
  return m.kind === "image" ? (
    <Img url={url} title={m.title} />
  ) : (
    <video
      src={url}
      controls
      playsInline
      preload={active ? "auto" : "metadata"}
      className="max-h-full max-w-full rounded-xl"
    />
  );
}

/** Image with a graceful fallback when the format won't decode. */
function Img({ url, title }: { url: string; title: string }) {
  const [broken, setBroken] = useState(false);
  if (broken)
    return (
      <div className="flex aspect-[3/4] max-h-full flex-col items-center justify-center gap-2 rounded-xl bg-white/10 p-6 text-center text-white/60">
        <ImageOff className="h-10 w-10" />
        <p className="text-sm font-semibold">Не удалось показать файл</p>
      </div>
    );
  return (
    <img
      src={url}
      alt={title}
      draggable={false}
      onError={() => setBroken(true)}
      className="max-h-full max-w-full rounded-xl object-contain"
    />
  );
}
