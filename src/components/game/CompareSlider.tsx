import { useRef, useState } from "react";
import { GripVertical, ImageOff } from "lucide-react";
import { useBlobUrl, type MediaItem } from "@/lib/media";

const fmtDay = (d: string) =>
  new Date(d + "T00:00").toLocaleDateString("ru", { day: "numeric", month: "short" });

const clamp = (v: number) => Math.min(100, Math.max(0, v));

/** Before/after curtain: drag or use the arrow keys. */
export function CompareSlider({ before, after }: { before: MediaItem; after: MediaItem }) {
  const a = useBlobUrl(before.blob);
  const b = useBlobUrl(after.blob);
  const [pos, setPos] = useState(50);
  const [drag, setDrag] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const move = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    setPos(clamp(((clientX - r.left) / r.width) * 100));
  };

  return (
    <div
      ref={box}
      role="slider"
      tabIndex={0}
      aria-label="Шторка сравнения: было / стало"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pos)}
      aria-valuetext={`${Math.round(pos)}% фото «было»`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(true);
        move(e.clientX);
      }}
      onPointerMove={(e) => {
        if (drag) move(e.clientX);
      }}
      onPointerUp={() => setDrag(false)}
      onPointerCancel={() => setDrag(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") setPos((p) => clamp(p - 5));
        else if (e.key === "ArrowRight") setPos((p) => clamp(p + 5));
        else if (e.key === "Home") setPos(0);
        else if (e.key === "End") setPos(100);
      }}
      className="relative h-full w-full touch-none select-none overflow-hidden rounded-2xl bg-black outline-none [touch-action:none] focus-visible:ring-4 focus-visible:ring-white/40"
    >
      {b ? (
        <img
          src={b}
          alt={after.title || "Стало"}
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <Missing />
      )}
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        aria-hidden
      >
        {a ? (
          <img
            src={a}
            alt={before.title || "Было"}
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <Missing />
        )}
      </div>

      <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
        Было · {fmtDay(before.date)}
      </span>
      <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
        Стало · {fmtDay(after.date)}
      </span>
      <span
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90"
        style={{ left: `${pos}%` }}
      >
        <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-lg">
          <GripVertical className="h-5 w-5" />
        </span>
      </span>
    </div>
  );
}

function Missing() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/10 text-sm text-white/60">
      <ImageOff className="h-8 w-8" />
      Фото недоступно
    </div>
  );
}
