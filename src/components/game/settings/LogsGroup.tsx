import { useEffect, useState } from "react";
import { Copy, Download, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TapButton } from "@/components/game/TapButton";
import {
  clearLogs,
  formatLogs,
  getLogs,
  isDebug,
  logError,
  logsFileName,
  setDebug,
  type LogEntry,
} from "@/lib/logger";
import { SectionCard } from "./SectionCard";

const time = (ts: number) =>
  new Date(ts).toLocaleString([], {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const levelColor: Record<LogEntry["level"], string> = {
  debug: "text-muted-foreground",
  info: "text-foreground",
  warn: "text-flame-shade",
  error: "text-destructive",
};

/**
 * Diagnostics lives outside the settings draft: export/clear buttons act on the
 * journal immediately (like the data section), there is nothing to "save".
 */
export function LogsGroup() {
  const [logs, setLogs] = useState<LogEntry[]>(() => getLogs());
  const [debug, setDebugUi] = useState(() => isDebug());
  const [preview, setPreview] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    // Refresh the preview if new entries arrive while the screen is open.
    const t = setInterval(() => setLogs(getLogs()), 2000);
    return () => clearInterval(t);
  }, []);

  const text = () => formatLogs(logs);

  const download = () => {
    const blob = new Blob([text()], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = logsFileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast.success(`Файл ${a.download} сохранён`);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text());
      toast.success("Логи скопированы в буфер");
    } catch (e) {
      logError("logs", "Copy failed", e);
      toast.error("Не удалось скопировать — скачай файл");
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: logsFileName(), text: text() });
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // user closed the share sheet
      logError("logs", "Share failed", e);
      toast.error("Не удалось поделиться — скачай файл");
    }
  };

  const clear = () => {
    clearLogs();
    setLogs(getLogs());
    setConfirmClear(false);
    toast.success("Логи очищены");
  };

  const last = logs.at(-1);

  return (
    <SectionCard
      title="Диагностика"
      hint="Журнал работы хранится только на этом устройстве: как приложение открывалось, что делали запросы к ИИ и какие были ошибки. Экспортируй файл и пришли его вместе с описанием проблемы."
    >
      <p className="text-sm text-muted-foreground">
        записей: <b className="tabular text-foreground">{logs.length}</b>
        {last && (
          <>
            {" "}
            · последняя <b className="tabular text-foreground">{time(last.ts)}</b>
          </>
        )}
      </p>
      <div className="flex items-center justify-between gap-3">
        <span>Подробные логи (debug)</span>
        <Switch
          checked={debug}
          onCheckedChange={(x) => {
            setDebug(x);
            setDebugUi(x);
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TapButton size="sm" className="min-h-[44px]" onClick={download}>
          <Download className="h-4 w-4" /> Экспортировать
        </TapButton>
        <TapButton variant="soft" size="sm" className="min-h-[44px]" onClick={() => void copy()}>
          <Copy className="h-4 w-4" /> Копировать
        </TapButton>
        {"share" in navigator && (
          <TapButton variant="soft" size="sm" className="min-h-[44px]" onClick={() => void share()}>
            <Share2 className="h-4 w-4" /> Поделиться
          </TapButton>
        )}
        <TapButton
          variant="soft"
          size="sm"
          className="min-h-[44px] text-destructive"
          onClick={() => setConfirmClear(true)}
        >
          <Trash2 className="h-4 w-4" /> Очистить
        </TapButton>
      </div>
      <button
        className="text-sm font-semibold text-foreground"
        onClick={() => setPreview(true)}
        disabled={logs.length === 0}
      >
        Посмотреть последние записи
      </button>

      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle>Последние записи</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 font-mono text-xs">
            {logs
              .slice(-50)
              .reverse()
              .map((e, i) => (
                <div key={`${e.ts}-${i}`} className="rounded-xl bg-muted p-2">
                  <span className={`font-bold ${levelColor[e.level]}`}>[{e.level}]</span>{" "}
                  <span className="text-muted-foreground tabular">{time(e.ts)}</span>{" "}
                  <span className="font-semibold">{e.tag}</span>
                  <p className="mt-0.5 break-words">{e.message}</p>
                  {e.data && <p className="mt-0.5 break-all text-muted-foreground">{e.data}</p>}
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Очистить журнал?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Все {logs.length} записей будут удалены безвозвратно.
          </p>
          <TapButton variant="soft" className="w-full text-destructive" onClick={clear}>
            Удалить журнал
          </TapButton>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
