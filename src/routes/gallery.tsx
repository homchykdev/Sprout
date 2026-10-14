import { createFileRoute } from "@tanstack/react-router";
import { Download, ImagePlus, Link2, Play, Trash2, Upload } from "lucide-react";
import { LinkMedia } from "@/components/game/LinkMedia";
import { clipsToText, parseClips, parseLink, ytThumb } from "@/lib/embed";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Mascot } from "@/components/game/Mascot";
import { TapButton } from "@/components/game/TapButton";
import { addFiles, addLink, exportMedia, importMedia, removeMedia, updateMedia, useBlobUrl, useMedia, type Album, type MediaItem } from "@/lib/media";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/gallery")({
  head: () => ({
    meta: [
      { title: "Фото прогресса и цели · Пульс" },
      { name: "description", content: "Личная хронология фото и видео прогресса и доска целей фигуры." },
      { property: "og:title", content: "Фото прогресса и цели · Пульс" },
      { property: "og:description", content: "Смотри, как меняется тело, и держи цель перед глазами." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Gallery,
});

const fmtDay = (d: string) => new Date(d + "T00:00").toLocaleDateString("ru", { day: "numeric", month: "long" });
const fmtMonth = (d: string) => { const s = new Date(d + "T00:00").toLocaleDateString("ru", { month: "long", year: "numeric" }); return s[0]!.toUpperCase() + s.slice(1); };

function Gallery() {
  const [album, setAlbum] = useState<Album>("progress");
  const items = useMedia(album);
  const [open, setOpen] = useState<MediaItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const arch = useRef<HTMLInputElement>(null);

  const upload = async (fs: FileList | null) => {
    if (!fs?.length) return;
    setBusy(true);
    try { await addFiles([...fs], album); toast.success("Добавлено"); } catch { toast.error("Не удалось сохранить — возможно, мало места"); } finally { setBusy(false); }
  };
  const save = async () => {
    const b = await exportMedia(album);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = `pulse-${album === "progress" ? "progress" : "goals"}-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <div className="space-y-4">
      <h1 className="pt-2 text-3xl font-extrabold tracking-tight">Фото</h1>
      <div className="flex rounded-full bg-muted p-1 text-sm font-semibold">
        {([["progress", "Мой прогресс"], ["goal", "Цели фигуры"]] as const).map(([id, l]) => (
          <button key={id} onClick={() => setAlbum(id)} className={cn("flex-1 rounded-full py-2 transition-colors", album === id ? "bg-card shadow-sm" : "text-muted-foreground")}>{l}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <TapButton className="flex-1" disabled={busy} onClick={() => file.current?.click()}><ImagePlus className="h-4 w-4" /> {busy ? "Сохраняю…" : "Загрузить"}</TapButton>
        <TapButton variant="soft" aria-label="Добавить по ссылке" onClick={() => setLinkOpen(true)}><Link2 className="h-4 w-4" /></TapButton>
        <TapButton variant="soft" aria-label="Сохранить архив" onClick={save}><Download className="h-4 w-4" /></TapButton>
        <TapButton variant="soft" aria-label="Загрузить архив" onClick={() => arch.current?.click()}><Upload className="h-4 w-4" /></TapButton>
      </div>
      <input ref={file} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
      <input ref={arch} type="file" accept="application/json" hidden onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (!f) return;
        try { const n = await importMedia(f); toast.success(`Загружено: ${n}`); } catch { toast.error("Это не архив фото Пульса"); }
      }} />

      {items === null ? null : !items.length ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Mascot mood="cheer" size={90} />
          <p className="font-semibold">{album === "progress" ? "Сделай первое фото — через месяц скажешь спасибо" : "Добавь фото фигуры мечты"}</p>
          <p className="text-sm text-muted-foreground">Всё хранится только на этом устройстве.</p>
        </div>
      ) : album === "progress" ? (
        <Timeline items={items} onOpen={setOpen} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {items.map((m) => <Tile key={m.id} m={m} onClick={() => setOpen(m)} big />)}
        </div>
      )}
      <Viewer item={open} onClose={() => setOpen(null)} />
      <LinkDialog open={linkOpen} album={album} onClose={() => setLinkOpen(false)} />
    </div>
  );
}

function Timeline({ items, onOpen }: { items: MediaItem[]; onOpen: (m: MediaItem) => void }) {
  const first = items[items.length - 1]!.date;
  const months: [string, MediaItem[]][] = [];
  for (const m of items) {
    const k = m.date.slice(0, 7);
    const last = months[months.length - 1];
    if (last && last[0] === k) last[1].push(m); else months.push([k, [m]]);
  }
  return (
    <div className="space-y-6">
      {months.map(([k, list]) => (
        <section key={k}>
          <h2 className="mb-3 text-lg font-bold">{fmtMonth(k + "-01")}</h2>
          <div className="relative space-y-4 border-l-2 border-muted pl-5">
            {list.map((m) => {
              const day = Math.round((+new Date(m.date) - +new Date(first)) / 864e5);
              return (
                <div key={m.id} className="relative">
                  <span className="absolute -left-[27px] top-3 h-3 w-3 rounded-full border-2 border-card bg-primary" />
                  <button onClick={() => onOpen(m)} className="card-soft press flex w-full gap-3 p-3 text-left">
                    <Tile m={m} className="h-24 w-20 shrink-0" />
                    <div className="min-w-0 flex-1 py-1">
                      <p className="text-xs font-bold uppercase tracking-wide text-primary-shade">{fmtDay(m.date)} · {day === 0 ? "старт" : `день ${day}`}</p>
                      <p className="truncate font-semibold">{m.title || (m.kind === "video" ? "Видео" : "Фото")}</p>
                      {m.note && <p className="line-clamp-2 text-sm text-muted-foreground">{m.note}</p>}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function Tile({ m, onClick, className, big }: { m: MediaItem; onClick?: () => void; className?: string; big?: boolean }) {
  const url = useBlobUrl(m.blob);
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={cn("press relative overflow-hidden rounded-2xl bg-muted", big && "aspect-[3/4] w-full", className)}>
      {m.url ? <LinkThumb url={m.url} /> : url && (m.kind === "image" ? <img src={url} alt={m.title} loading="lazy" className="h-full w-full object-cover" /> : <video src={url + "#t=0.1"} muted playsInline preload="metadata" className="h-full w-full object-cover" />)}
      {m.url && <span className="absolute left-1.5 top-1.5 rounded-full bg-foreground/60 p-1 text-background"><Link2 className="h-3 w-3" /></span>}
      {m.kind === "video" && <span className="absolute bottom-1.5 right-1.5 rounded-full bg-foreground/60 p-1 text-background"><Play className="h-3 w-3" fill="currentColor" /></span>}
      {big && m.title && <span className="absolute inset-x-0 bottom-0 bg-foreground/50 px-2 py-1.5 text-left text-xs font-semibold text-background">{m.title}</span>}
    </Tag>
  );
}

function Viewer({ item, onClose }: { item: MediaItem | null; onClose: () => void }) {
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl">
        {item && <ViewerBody key={item.id} item={item} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ViewerBody({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const url = useBlobUrl(item.blob);
  const [title, setTitle] = useState(item.title);
  const [note, setNote] = useState(item.note);
  const [date, setDate] = useState(item.date);
  const [clips, setClips] = useState(clipsToText(item.clips));
  const lk = item.url ? parseLink(item.url) : null;
  const canClip = lk?.type === "youtube" || lk?.type === "video";
  const field = "w-full rounded-2xl border-2 px-4 outline-none focus:border-primary";
  return (
    <>
      <DialogTitle className="sr-only">{item.title || "Медиа"}</DialogTitle>
      <div className="overflow-hidden rounded-2xl bg-muted">
        {item.url ? <div className="aspect-video"><LinkMedia url={item.url} clips={parseClips(clips)} controls muted={false} /></div>
          : url && (item.kind === "image" ? <img src={url} alt={item.title} className="max-h-[50vh] w-full object-contain" /> : <video src={url} controls playsInline className="max-h-[50vh] w-full" />)}
      </div>
      {item.url && canClip && <textarea rows={2} className={cn(field, "py-3")} placeholder={"Таймкоды (необязательно):\n1:20-1:45"} value={clips} onChange={(e) => setClips(e.target.value)} />}
      <input className={cn(field, "h-12")} placeholder="Название (необязательно)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea rows={3} className={cn(field, "py-3")} placeholder="Описание или заметки: вес, самочувствие, что изменилось…" value={note} onChange={(e) => setNote(e.target.value)} />
      <label className="text-sm font-semibold">Дата<input type="date" className={cn(field, "mt-1 h-12")} value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <div className="flex gap-2">
        <TapButton className="flex-1" onClick={async () => { await updateMedia(item.id, { title: title.trim(), note: note.trim(), date: date || item.date, clips: item.url ? parseClips(clips) : undefined }); toast.success("Сохранено"); onClose(); }}>Сохранить</TapButton>
        <TapButton variant="soft" aria-label="Удалить" onClick={async () => { if (confirm("Удалить навсегда?")) { await removeMedia(item.id); onClose(); } }}><Trash2 className="h-4 w-4" /></TapButton>
      </div>
    </>
  );
}

function LinkThumb({ url }: { url: string }) {
  const k = parseLink(url);
  if (k?.type === "youtube") return <img src={ytThumb(k.id)} alt="" loading="lazy" className="h-full w-full object-cover" />;
  if (k?.type === "image") return <img src={k.url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />;
  return <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Link2 className="h-8 w-8" /></div>;
}

function LinkDialog({ open, album, onClose }: { open: boolean; album: Album; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [clips, setClips] = useState("");
  const k = parseLink(url);
  const canClip = k?.type === "youtube" || k?.type === "video";
  const field = "w-full rounded-2xl border-2 px-4 outline-none focus:border-primary";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl">
        <DialogTitle>Добавить по ссылке</DialogTitle>
        <input className={cn(field, "h-12")} placeholder="https://youtube.com/… или ссылка на фото/видео" value={url} onChange={(e) => setUrl(e.target.value)} />
        {url && !k && <p className="text-sm text-destructive">Это не похоже на ссылку</p>}
        {k && <div className="aspect-video overflow-hidden rounded-2xl bg-muted"><LinkMedia url={url} clips={parseClips(clips)} controls /></div>}
        {canClip && <textarea rows={2} className={cn(field, "py-3")} placeholder={"Таймкоды (необязательно), каждый с новой строки:\n1:20-1:45"} value={clips} onChange={(e) => setClips(e.target.value)} />}
        <p className="text-xs text-muted-foreground">Файл не скачивается — он загрузится из интернета, когда ты его откроешь.</p>
        <TapButton disabled={!k} onClick={async () => {
          await addLink(url.trim(), album, k!.type === "image" ? "image" : "video", canClip ? parseClips(clips) : undefined);
          toast.success("Добавлено"); setUrl(""); setClips(""); onClose();
        }}>Добавить</TapButton>
      </DialogContent>
    </Dialog>
  );
}
