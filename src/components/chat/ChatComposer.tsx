import { useEffect, useRef, useState } from "react";
import { Loader2, Paperclip, Send, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MAX_FILE_MB = 10;
const MAX_FILES = 4;

export interface PendingAttachment {
  name: string;
  mimeType: string;
  base64: string;
}

export function ChatComposer({
  busy,
  prefill,
  onPrefillConsumed,
  onSend,
}: {
  busy: boolean;
  /** Seed prompt to drop into the input once (e.g. `?seed=exercise`). */
  prefill?: string | undefined;
  onPrefillConsumed?: () => void;
  onSend: (text: string, attachments: PendingAttachment[]) => void;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const sending = busy || (text.trim().length === 0 && files.length === 0);

  useEffect(() => {
    if (prefill) {
      setText(prefill);
      onPrefillConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefill arrives once per seed
  }, [prefill]);

  const addFiles = (picked: FileList | null) => {
    if (!picked) return;
    const next = [...files];
    for (const f of picked) {
      if (next.length >= MAX_FILES) break;
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`«${f.name}» больше ${MAX_FILE_MB} МБ — не возьму`);
        continue;
      }
      next.push(f);
    }
    setFiles(next.slice(0, MAX_FILES));
  };

  const send = async () => {
    if (sending) return;
    const t = text.trim();
    const picked = files;
    setText("");
    setFiles([]);
    try {
      const atts = await Promise.all(picked.map(toBase64));
      onSend(t, atts);
    } catch {
      toast.error("Не удалось прочитать вложение");
    }
  };

  return (
    <div className="glass fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 border-t py-2">
      <div className="mx-auto max-w-xl px-3">
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="flex max-w-full items-center gap-1 rounded-full bg-card px-2.5 py-1 text-[11px] font-semibold shadow-sm"
              >
                <span className="max-w-40 truncate">{f.name}</span>
                <button
                  type="button"
                  aria-label={`Убрать ${f.name}`}
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  className="press"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,video/*,application/pdf"
            className="hidden"
            aria-hidden
            tabIndex={-1}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Прикрепить файл"
            className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <textarea
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={busy ? "ИИ печатает…" : "Спроси про тренировки…"}
            aria-label="Сообщение"
            className="min-h-[44px] max-h-32 flex-1 resize-none rounded-2xl border-2 bg-card px-4 py-2.5 text-[15px] outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending}
            aria-label="Отправить"
            className={cn(
              "press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary-foreground",
              sending ? "bg-muted text-muted-foreground" : "bg-primary",
            )}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function toBase64(file: File): Promise<PendingAttachment> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => {
      const res = String(r.result);
      resolve({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        base64: res.slice(res.indexOf(",") + 1),
      });
    };
    r.readAsDataURL(file);
  });
}
