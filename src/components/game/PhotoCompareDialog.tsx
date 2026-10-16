import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useBlobUrl, type MediaItem } from "@/lib/media";
import { LinkMedia } from "./LinkMedia";
import { parseLink } from "@/lib/embed";

const fmtDay = (d: string) =>
  new Date(d + "T00:00").toLocaleDateString("ru", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

function Side({ m }: { m: MediaItem }) {
  const url = useBlobUrl(m.blob);
  const link = m.url ? parseLink(m.url) : null;
  return (
    <figure className="min-w-0">
      <div className="overflow-hidden rounded-2xl bg-muted">
        {link ? (
          <LinkMedia url={m.url!} controls muted={false} />
        ) : url ? (
          m.kind === "image" ? (
            <img src={url} alt={m.title} className="aspect-[3/4] w-full object-cover" />
          ) : (
            <video src={url} controls playsInline className="aspect-[3/4] w-full object-cover" />
          )
        ) : (
          <div className="aspect-[3/4] w-full animate-pulse bg-muted" />
        )}
      </div>
      <figcaption className="mt-1.5 truncate text-center text-xs font-semibold">
        {m.title || (m.kind === "video" ? "Видео" : "Фото")}
      </figcaption>
      <p className="text-center text-[11px] text-muted-foreground">{fmtDay(m.date)}</p>
    </figure>
  );
}

/** Before/after: two photos side by side with dates. */
export function PhotoCompareDialog({
  items,
  onClose,
}: {
  items: MediaItem[];
  onClose: () => void;
}) {
  const [a, b] = items;
  return (
    <Dialog open={items.length === 2} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl">
        <DialogTitle>Сравнение</DialogTitle>
        {a && b && (
          <div className="grid grid-cols-2 gap-2">
            <Side m={a} />
            <Side m={b} />
          </div>
        )}
        <p className="text-center text-xs text-muted-foreground">Слева — более раннее фото</p>
      </DialogContent>
    </Dialog>
  );
}
