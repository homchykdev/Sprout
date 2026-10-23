import { useEffect, useState } from "react";
import { ImageOff, Pause, Play } from "lucide-react";
import { useBlobUrl, type MediaItem } from "@/lib/media";
import { cn } from "@/lib/utils";

const fmtDay = (d: string) =>
  new Date(d + "T00:00").toLocaleDateString("ru", { day: "numeric", month: "short" });

/** Flip through 3+ photos with a range, filmstrip and auto-play. */
export function CompareScrubber({ items }: { items: MediaItem[] }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const n = items.length;
  const cur = items[Math.min(index, n - 1)];

  useEffect(() => {
    if (!playing || n < 2) return;
    const t = setInterval(() => setIndex((v) => (v + 1) % n), 700);
    return () => clearInterval(t);
  }, [playing, n]);

  if (!cur) return null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="relative min-h-0 flex-1">
        <Slide m={cur} />
        <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
          {cur.title || "Фото"} · {fmtDay(cur.date)}
        </span>
        <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold tabular text-white backdrop-blur">
          {index + 1} / {n}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={playing ? "Пауза" : "Проиграть фото"}
          aria-pressed={playing}
          onClick={() => setPlaying((p) => !p)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(0, n - 1)}
          step={1}
          value={index}
          aria-label="Фото на шкале времени"
          aria-valuetext={`${cur.title || "Фото"}, ${fmtDay(cur.date)}`}
          onChange={(e) => {
            setPlaying(false);
            setIndex(Number(e.target.value));
          }}
          className="h-11 w-full cursor-pointer accent-primary"
        />
      </div>

      <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {items.map((m, i) => (
          <button
            key={m.id}
            type="button"
            aria-label={`${m.title || "Фото"} — ${fmtDay(m.date)}`}
            aria-current={i === index}
            onClick={() => {
              setPlaying(false);
              setIndex(i);
            }}
            className={cn(
              "relative aspect-[3/4] w-14 shrink-0 snap-start overflow-hidden rounded-xl border-2 transition-opacity",
              i === index ? "border-white" : "border-transparent opacity-60 hover:opacity-100",
            )}
          >
            <Thumb m={m} />
            <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-[10px] font-semibold text-white">
              {fmtDay(m.date)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Slide({ m }: { m: MediaItem }) {
  const url = useBlobUrl(m.blob);
  if (!m.blob)
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-2xl bg-white/10 text-white/60">
        <ImageOff className="h-8 w-8" />
        <p className="text-sm">Файл отсутствует на устройстве</p>
      </div>
    );
  if (!url) return <div className="h-full w-full animate-pulse rounded-2xl bg-white/10" />;
  return (
    <img
      src={url}
      alt={m.title || "Фото прогресса"}
      draggable={false}
      className="h-full w-full rounded-2xl object-contain"
    />
  );
}

function Thumb({ m }: { m: MediaItem }) {
  const url = useBlobUrl(m.blob);
  return url ? (
    <img src={url} alt="" draggable={false} className="h-full w-full object-cover" />
  ) : (
    <span className="block h-full w-full bg-white/10" />
  );
}
