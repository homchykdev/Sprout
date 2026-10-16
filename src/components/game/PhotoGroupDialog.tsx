import { Star, Ungroup } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { setCover, ungroup, type MediaItem } from "@/lib/media";
import { TapButton } from "./TapButton";
import { PhotoTile } from "./PhotoTile";
import { cn } from "@/lib/utils";

interface Props {
  groupId: string | null;
  items: MediaItem[];
  onClose: () => void;
  onView: (m: MediaItem) => void;
}

/** Group viewer: all angles, pick the preview, ungroup. */
export function PhotoGroupDialog({ groupId, items, onClose, onView }: Props) {
  const [busy, setBusy] = useState(false);
  const list = items.filter((x) => x.groupId === groupId).sort((a, b) => a.createdAt - b.createdAt);
  const doUngroup = async () => {
    if (!groupId || !confirm("Разгруппировать? Фото останутся, группа распадётся.")) return;
    setBusy(true);
    await ungroup(groupId);
    setBusy(false);
    toast.success("Группа распущена");
    onClose();
  };
  return (
    <Dialog open={!!groupId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl">
        <DialogTitle>Группа · {list.length} фото</DialogTitle>
        <div className="grid grid-cols-3 gap-2">
          {list.map((m) => (
            <div key={m.id} className="relative">
              <PhotoTile m={m} big onClick={() => onView(m)} />
              <button
                aria-label={m.cover ? "Это превью группы" : "Сделать превью группы"}
                title={m.cover ? "Превью группы" : "Сделать превью"}
                disabled={busy || !!m.cover}
                onClick={() =>
                  setCover(groupId!, m.id).then(() => toast.success("Превью обновлено"))
                }
                className={cn(
                  "absolute left-1.5 top-1.5 rounded-full p-1.5",
                  m.cover ? "bg-gold text-primary-foreground" : "bg-foreground/60 text-background",
                )}
              >
                <Star className="h-3.5 w-3.5" fill={m.cover ? "currentColor" : "none"} />
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Звёздочка — какое фото стоит превью группы. Название и заметки берутся у фото-превью.
        </p>
        <TapButton
          variant="soft"
          size="sm"
          className="min-h-[44px] w-full"
          disabled={busy}
          onClick={doUngroup}
        >
          <Ungroup className="h-4 w-4" /> Разгруппировать
        </TapButton>
      </DialogContent>
    </Dialog>
  );
}
