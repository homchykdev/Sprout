import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight, Columns2, GalleryHorizontalEnd, X } from "lucide-react";
import { STRAIN_LABEL, VIEW_LABEL } from "@/lib/pose";
import type { MediaItem } from "@/lib/media";
import { cn } from "@/lib/utils";
import { CompareSlider } from "./CompareSlider";
import { CompareScrubber } from "./CompareScrubber";

const fmtDay = (d: string) =>
  new Date(d + "T00:00").toLocaleDateString("ru", { day: "numeric", month: "short" });

type Mode = "slider" | "scrub";

/** Full-screen compare: curtain for two photos, flip-through for three or more. */
export function PhotoCompare({ items, onClose }: { items: MediaItem[]; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const sorted = useMemo(
    () => [...items].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt),
    [items],
  );
  const [mode, setMode] = useState<Mode>(sorted.length === 2 ? "slider" : "scrub");
  const [flipped, setFlipped] = useState(false);
  const open = sorted.length >= 2;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const pair = flipped && first && last ? [last, first] : [first, last];

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    setMode(sorted.length === 2 ? "slider" : "scrub");
    setFlipped(false);
  }, [open, sorted.length]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const same =
    !!first?.pose &&
    !!first.strain &&
    sorted.every((m) => m.pose === first.pose && m.strain === first.strain);

  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Сравнение фото"
    >
      <header className="flex items-center gap-2 px-4 pt-[env(safe-area-inset-top)]">
        <p className="flex-1 py-3 text-center text-sm font-semibold">Сравнение</p>
        <button
          type="button"
          aria-label="Закрыть сравнение"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30"
        >
          <X className="h-6 w-6" />
        </button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2">
        <div className="flex rounded-full bg-white/10 p-1">
          <ModeButton active={mode === "slider"} onClick={() => setMode("slider")}>
            <Columns2 className="h-4 w-4" /> Шторка
          </ModeButton>
          <ModeButton active={mode === "scrub"} onClick={() => setMode("scrub")}>
            <GalleryHorizontalEnd className="h-4 w-4" /> Перелистывание
          </ModeButton>
        </div>
        {mode === "slider" && sorted.length > 2 && (
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className="flex h-11 items-center gap-2 rounded-full px-3 text-xs font-semibold text-white/80 hover:bg-white/10"
          >
            <ArrowLeftRight className="h-4 w-4" /> Поменять
          </button>
        )}
      </div>

      {same && first?.pose && first.strain && (
        <p className="px-4 pb-1 text-center text-xs text-white/60">
          {VIEW_LABEL[first.pose]} · {STRAIN_LABEL[first.strain]} ·{" "}
          {sorted.length > 2
            ? `${fmtDay(first.date)} — ${fmtDay(last!.date)}`
            : `${fmtDay(first.date)} → ${fmtDay(last!.date)}`}
        </p>
      )}

      <div className="min-h-0 flex-1 px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {sorted.length < 2 ? (
          <p className="flex h-full items-center justify-center px-6 text-center text-sm text-white/60">
            Нужно минимум два фото — добавь или сними новое.
          </p>
        ) : mode === "slider" && pair[0] && pair[1] ? (
          <CompareSlider before={pair[0]} after={pair[1]} />
        ) : (
          <CompareScrubber items={sorted} />
        )}
      </div>
    </div>,
    document.body,
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30",
        active ? "bg-white text-black" : "text-white/70 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
