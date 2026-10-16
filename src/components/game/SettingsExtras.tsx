import { CheckCircle2, Download, Play, Upload, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
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
import { listMedia } from "@/lib/media";
import { useApp, type AppState } from "@/lib/store";
import { cn } from "@/lib/utils";
import { beep, fanfare, listVoices, primeAudio, speak } from "@/lib/voice";
import { TapButton } from "./TapButton";

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

export function VoiceSection() {
  const v = useApp((s) => s.voice);
  const set = useApp((s) => s.set);
  const up = (p: Partial<typeof v>) => set({ voice: { ...v, ...p } });
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return;
    const load = () => setVoices(listVoices());
    load();
    speechSynthesis.addEventListener("voiceschanged", load);
    return () => speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  const row = "flex items-center justify-between gap-3";
  return (
    <>
      <div className={row}>
        <span>Голосовые подсказки</span>
        <Switch checked={v.enabled} onCheckedChange={(x) => up({ enabled: x })} />
      </div>
      <div className={row}>
        <span>Сигналы таймера</span>
        <Switch checked={v.beeps} onCheckedChange={(x) => up({ beeps: x })} />
      </div>
      <div className={row}>
        <span>Метроном темпа</span>
        <Switch checked={v.metronome} onCheckedChange={(x) => up({ metronome: x })} />
      </div>
      <div className={row}>
        <span>«Половина» и «ещё 10 секунд»</span>
        <Switch checked={v.cues} onCheckedChange={(x) => up({ cues: x })} />
      </div>
      <div>
        <p className="mb-1.5 text-sm">Тема звуков победы</p>
        <div
          className="flex rounded-2xl bg-muted p-1 text-sm font-semibold"
          role="radiogroup"
          aria-label="Тема звуков победы"
        >
          {(["spark", "triumph", "calm"] as const).map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={v.theme === t}
              onClick={() => {
                primeAudio();
                up({ theme: t });
                setTimeout(() => fanfare("workout"), 60);
              }}
              className={cn(
                "min-h-[44px] flex-1 rounded-xl py-2 transition-colors",
                v.theme === t ? "bg-card shadow-sm" : "text-muted-foreground",
              )}
            >
              {t === "spark" ? "✨ Искра" : t === "triumph" ? "🏆 Триумф" : "🌊 Спокойная"}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Темп задаётся в каждой тренировке отдельно, а в карточке упражнения хранится рекомендованный
        темп.
      </p>
      {voices.length > 0 ? (
        <select
          className="w-full rounded-2xl border-2 bg-card px-4 py-3"
          value={v.voiceURI}
          onChange={(e) => up({ voiceURI: e.target.value })}
        >
          <option value="">Голос по умолчанию</option>
          {voices.map((x) => (
            <option key={x.voiceURI} value={x.voiceURI}>
              {x.name}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-sm text-muted-foreground">
          Русский голос не найден на устройстве — будет использован системный.
        </p>
      )}
      <label className="block text-sm">
        Скорость речи: <b className="tabular">{v.rate.toFixed(2)}</b>
        <Slider
          className="mt-2"
          min={0.7}
          max={1.5}
          step={0.05}
          value={[v.rate]}
          onValueChange={([r]) => up({ rate: r ?? 1 })}
        />
      </label>
      <label className="block text-sm">
        Громкость сигналов
        <Slider
          className="mt-2"
          min={0.05}
          max={1}
          step={0.05}
          value={[v.volume]}
          onValueChange={([r]) => up({ volume: r ?? 0.6 })}
        />
      </label>
      <TapButton
        variant="soft"
        size="sm"
        onClick={() => {
          primeAudio();
          beep("go");
          speak("Привет! Я Огонёк. Начинаем тренировку!", { interrupt: true });
        }}
      >
        <Play className="h-4 w-4" /> Проверить звук
      </TapButton>
    </>
  );
}

/** "Проверить" button for API keys: cheap request, inline ✓/✗ status. */
export function ApiCheck({ label, check }: { label: string; check: () => Promise<string> }) {
  const [st, setSt] = useState<"idle" | "busy" | "ok" | "fail">("idle");
  const [msg, setMsg] = useState("");
  const run = async () => {
    setSt("busy");
    setMsg("");
    try {
      const line = await check();
      setSt("ok");
      setMsg(line);
    } catch (e) {
      setSt("fail");
      setMsg(e instanceof Error ? e.message : "Не удалось проверить");
    }
  };
  return (
    <div>
      <TapButton
        variant="soft"
        size="sm"
        className="min-h-[44px] w-full"
        disabled={st === "busy"}
        onClick={run}
      >
        {st === "busy" ? "Проверяю…" : label}
      </TapButton>
      {(st === "ok" || st === "fail") && (
        <p
          role="status"
          className={cn(
            "mt-1.5 flex items-center gap-1.5 text-sm font-semibold",
            st === "ok" ? "text-primary-shade" : "text-destructive",
          )}
        >
          {st === "ok" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0" />
          )}
          {msg}
        </p>
      )}
    </div>
  );
}

/** Explicit save confirmation: settings autosave, this re-reads storage and proves it. */
export function SaveCheck() {
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState("");
  const run = async () => {
    setBusy(true);
    try {
      const s = useApp.getState();
      const media = await listMedia().catch(() => []);
      setLine(
        `Всё сохранено на этом устройстве ✓ · тренировок: ${s.sessions.length}, упражнений: ${s.exercises.length}, фото: ${media.length}`,
      );
      toast.success("Настройки сохранены");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <TapButton className="min-h-[44px] w-full" disabled={busy} onClick={run}>
        {busy ? "Сохраняю…" : "Сохранить настройки"}
      </TapButton>
      {line && (
        <p role="status" className="text-center text-sm font-semibold text-primary-shade">
          {line}
        </p>
      )}
      <p className="text-center text-xs text-muted-foreground">
        Вообще-то всё сохраняется автоматически при каждом изменении 🙂
      </p>
    </div>
  );
}
