import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TapButton } from "@/components/game/TapButton";
import {
  applyBackup,
  buildSingleFile,
  countRecords,
  fileNameFor,
  parseSingleFile,
  SECTIONS,
  SECTION_EMOJI,
  type SectionId,
  type Strategy,
} from "@/lib/backup";
import { useApp, type AppState } from "@/lib/store";
import { cn } from "@/lib/utils";
import { SectionCard } from "./SectionCard";

const ORDER: SectionId[] = ["library", "progress", "workouts", "vacations", "prefs", "keys"];
/** Sections where merging makes sense; prefs/keys can only be replaced. */
const MERGEABLE: SectionId[] = ["library", "progress", "workouts", "vacations"];

function friendlyError(id: SectionId, e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (m.startsWith("wrong-section:")) {
    const actual = m.slice("wrong-section:".length) as SectionId;
    const name =
      (SECTIONS as Record<string, { label: string }>)[actual]?.label ?? "другого раздела";
    return `Это файл «${name}», а ты загружаешь в «${SECTIONS[id].label}». Данные не тронуты — выбери нужный раздел.`;
  }
  if (m === "not-pulse" || m === "not-json")
    return "Файл не похож на резервную копию Пульса. Данные не тронуты.";
  return "Файл повреждён или не подходит для этого раздела. Данные не тронуты.";
}

/** Backup export/import per section; applies to the store immediately (outside the draft). */
export function DataSection() {
  const [target, setTarget] = useState<SectionId | null>(null);
  const [incoming, setIncoming] = useState<{ id: SectionId; data: Partial<AppState> } | null>(null);
  const [strategy, setStrategy] = useState<Strategy>("merge");
  const [problem, setProblem] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const doExport = (id: SectionId) => {
    const blob = new Blob([JSON.stringify(buildSingleFile(id), null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileNameFor(id);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast.success(`Файл ${a.download} сохранён`);
  };

  const askImport = (id: SectionId) => {
    setTarget(id);
    setProblem(null);
    setStrategy(MERGEABLE.includes(id) ? "merge" : "replace");
    // Let the same file be picked twice in a row.
    if (file.current) file.current.value = "";
    file.current?.click();
  };

  const onFile = async (f: File | undefined) => {
    if (!f || !target) return;
    try {
      const data = parseSingleFile(await f.text(), target);
      setIncoming({ id: target, data });
    } catch (e) {
      setProblem(friendlyError(target, e));
    }
  };

  const confirm = () => {
    if (!incoming) return;
    applyBackup({ [incoming.id]: incoming.data }, { [incoming.id]: strategy });
    setIncoming(null);
    setTarget(null);
    toast.success("Данные загружены");
  };

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Каждый раздел — отдельный файл. Загружай файл строго в свою карточку: чужой файл не испортит
        данные, а покажет подсказку.
      </p>
      <div className="space-y-2">
        {ORDER.map((id) => (
          <div key={id} className="rounded-2xl border-2 p-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden>
                {SECTION_EMOJI[id]}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold">{SECTIONS[id].label}</span>
                <span className="block text-xs text-muted-foreground">
                  {SECTIONS[id].hint} ·{" "}
                  <span className="tabular">{fileNameFor(id, "ГГГГ-ММ-ДД")}</span>
                </span>
              </span>
            </div>
            <div className="mt-2.5 flex gap-2">
              <TapButton
                size="sm"
                className="min-h-[44px] flex-1"
                onClick={() => doExport(id)}
                aria-label={`Скачать ${SECTIONS[id].label}`}
              >
                <Download className="h-4 w-4" /> Скачать
              </TapButton>
              <TapButton
                variant="soft"
                size="sm"
                className="min-h-[44px] flex-1"
                onClick={() => askImport(id)}
                aria-label={`Загрузить ${SECTIONS[id].label}`}
              >
                <Upload className="h-4 w-4" /> Загрузить
              </TapButton>
            </div>
          </div>
        ))}
      </div>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          void onFile(f);
        }}
      />
      {problem && (
        <div className="rounded-2xl border-2 border-destructive bg-card p-3 text-sm" role="alert">
          <p className="font-semibold text-destructive">Не подошло</p>
          <p className="mt-0.5 text-muted-foreground">{problem}</p>
          <button className="mt-1 font-semibold text-foreground" onClick={() => setProblem(null)}>
            Понятно
          </button>
        </div>
      )}

      <Dialog open={!!incoming} onOpenChange={(o) => !o && setIncoming(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle>Загрузить из файла?</DialogTitle>
          </DialogHeader>
          {incoming &&
            (() => {
              const c = countRecords(incoming.id, incoming.data);
              return (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {SECTION_EMOJI[incoming.id]}{" "}
                    <b className="text-foreground">{SECTIONS[incoming.id].label}</b>: найдено{" "}
                    <b className="tabular text-foreground">{c.count}</b> {c.label}.
                  </p>
                  {MERGEABLE.includes(incoming.id) ? (
                    <div className="flex rounded-xl bg-muted p-1 text-xs font-semibold">
                      {(["merge", "replace"] as const).map((k) => (
                        <button
                          key={k}
                          onClick={() => setStrategy(k)}
                          className={cn(
                            "min-h-[44px] flex-1 rounded-lg py-1.5 transition-colors",
                            strategy === k ? "bg-card shadow-sm" : "text-muted-foreground",
                          )}
                        >
                          {k === "merge" ? "Объединить (без дублей)" : "Заменить целиком"}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
                      Настройки и ключи всегда заменяются целиком.
                    </p>
                  )}
                  <TapButton className="w-full" onClick={confirm}>
                    Загрузить
                  </TapButton>
                </div>
              );
            })()}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DataGroup() {
  const resetAll = useApp((s) => s.resetAll);
  return (
    <SectionCard
      title="Данные"
      hint="Все данные хранятся на устройстве. Делай резервную копию, чтобы перенести прогресс."
    >
      <DataSection />
      <button
        className="text-sm font-semibold text-destructive"
        onClick={() => confirm("Удалить все данные безвозвратно?") && resetAll()}
      >
        Сбросить всё
      </button>
    </SectionCard>
  );
}
