import { useChat } from "@/lib/chat/store";
import { cn } from "@/lib/utils";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const dt = (iso: string) =>
  new Date(iso).toLocaleDateString("ru", { day: "numeric", month: "short" });

/** Список всех чатов: выбор, переименование, удаление, новый чат. */
export function ChatSessionList({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sessions = useChat((s) => s.sessions);
  const activeId = useChat((s) => s.activeId);
  const { select, create, remove, rename } = useChat.getState();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[80dvh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>Чаты</DialogTitle>
        </DialogHeader>
        <button
          type="button"
          onClick={() => {
            create("");
            toast("Новый чат создан");
            onClose();
          }}
          className="press flex min-h-[44px] w-full items-center gap-2 rounded-2xl bg-primary-soft px-4 text-sm font-bold text-primary-shade"
        >
          <Plus className="h-4 w-4" /> Новый чат
        </button>
        {sessions.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            История пуста — напиши что-нибудь в чате.
          </p>
        )}
        <ul className="space-y-2">
          {sessions.map((c) => (
            <li
              key={c.id}
              className={cn(
                "rounded-2xl border-2 p-3",
                c.id === activeId ? "border-primary bg-primary-soft/50" : "border-border bg-card",
              )}
            >
              {editing === c.id ? (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    rename(c.id, draft);
                    setEditing(null);
                  }}
                >
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    aria-label="Название чата"
                    className="min-w-0 flex-1 rounded-xl border-2 px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <button type="submit" aria-label="Сохранить название" className="press px-3">
                    <Check className="h-4 w-4" />
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      select(c.id);
                      onClose();
                    }}
                    className="press min-w-0 flex-1 text-left"
                  >
                    <span className="line-clamp-1 text-sm font-semibold">{c.title}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {dt(c.createdAt)} · {c.messages.length} сообщ.
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Переименовать"
                    className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"
                    onClick={() => {
                      setEditing(c.id);
                      setDraft(c.title);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Удалить чат"
                    className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-destructive hover:bg-muted"
                    onClick={() => {
                      remove(c.id);
                      toast("Чат удалён");
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
