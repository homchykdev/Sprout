import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { clipsToText, parseClips, parseLink } from "@/lib/embed";
import { updateMedia, type MediaItem } from "@/lib/media";
import { cn } from "@/lib/utils";
import { TapButton } from "./TapButton";

interface Props {
  item: MediaItem | null;
  onClose: () => void;
}

/** Edit form for a photo: title, notes, date (+ link timecodes). Opened from the card's «···». */
export function PhotoEditDialog({ item, onClose }: Props) {
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-3xl">
        {item && <Body key={item.id} item={item} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const [title, setTitle] = useState(item.title);
  const [note, setNote] = useState(item.note);
  const [date, setDate] = useState(item.date);
  const [clips, setClips] = useState(clipsToText(item.clips));
  const lk = item.url ? parseLink(item.url) : null;
  const canClip = lk?.type === "youtube" || lk?.type === "video";
  const field = "w-full rounded-2xl border-2 px-4 outline-none focus:border-primary";
  return (
    <>
      <DialogTitle>Изменить</DialogTitle>
      {item.url && canClip && (
        <textarea
          rows={2}
          className={cn(field, "py-3")}
          placeholder={"Таймкоды (необязательно):\n1:20-1:45"}
          value={clips}
          onChange={(e) => setClips(e.target.value)}
        />
      )}
      <input
        className={cn(field, "h-12")}
        placeholder="Название (необязательно)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        rows={3}
        className={cn(field, "py-3")}
        placeholder="Описание или заметки: вес, самочувствие, что изменилось…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <label className="text-sm font-semibold">
        Дата
        <input
          type="date"
          className={cn(field, "mt-1 h-12")}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <TapButton variant="soft" className="min-h-[44px] flex-1" onClick={onClose}>
          Отмена
        </TapButton>
        <TapButton
          className="min-h-[44px] flex-1"
          onClick={async () => {
            await updateMedia(item.id, {
              title: title.trim(),
              note: note.trim(),
              date: date || item.date,
              clips: item.url ? parseClips(clips) : undefined,
            });
            toast.success("Сохранено");
            onClose();
          }}
        >
          Сохранить
        </TapButton>
      </div>
    </>
  );
}
