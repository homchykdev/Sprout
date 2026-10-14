import { Download, Play, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { applyBackup, buildBackup, parseBackup, SECTIONS, type SectionId, type Strategy } from "@/lib/backup";
import { useMwCache } from "@/lib/mw-cache";
import { useApp, type AppState } from "@/lib/store";
import { cn } from "@/lib/utils";
import { beep, listVoices, primeAudio, speak } from "@/lib/voice";
import { TapButton } from "./TapButton";

const IDS = Object.keys(SECTIONS) as SectionId[];
const FILE_NAMES: Record<SectionId, string> = { progress: "progress", library: "exercises", workouts: "workouts", vacations: "vacations", prefs: "settings", keys: "keys" };

function Check({ on, onClick, label, hint }: { on: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button onClick={onClick} className={cn("press flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors", on && "border-primary bg-primary-soft")}>
      <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 text-xs font-bold", on && "border-primary bg-primary text-primary-foreground")}>{on ? "✓" : ""}</span>
      <span><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-muted-foreground">{hint}</span></span>
    </button>
  );
}

export function DataSection() {
  const [sel, setSel] = useState<SectionId[]>(IDS.filter((i) => i !== "keys"));
  const [parts, setParts] = useState<Partial<Record<SectionId, Partial<AppState>>> | null>(null);
  const [plan, setPlan] = useState<Partial<Record<SectionId, Strategy | "skip">>>({});
  const file = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    if (!sel.length) { toast("Выбери хотя бы один раздел"); return; }
    const day = new Date().toISOString().slice(0, 10);
    for (const id of sel) {
      const blob = new Blob([JSON.stringify(buildBackup([id]), null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `pulse-${FILE_NAMES[id]}-${day}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      await new Promise((r) => setTimeout(r, 400)); // browsers block rapid multi-downloads
    }
    toast.success(sel.length === 1 ? "Файл сохранён" : `Сохранено файлов: ${sel.length}`);
  };
  const onFiles = async (fs: File[]) => {
    try {
      const p: Partial<Record<SectionId, Partial<AppState>>> = {};
      for (const f of fs) Object.assign(p, parseBackup(await f.text()));
      setParts(p);
      setPlan(Object.fromEntries((Object.keys(p) as SectionId[]).map((id) => [id, id === "progress" || id === "library" || id === "workouts" ? "merge" : "replace"])));
    } catch {
      toast.error("Файл не похож на резервную копию Пульса");
    }
  };

  return (
    <>
      <p className="text-sm text-muted-foreground">Каждый раздел сохранится отдельным файлом. При импорте можно выбрать сразу несколько файлов.</p>
      <div className="space-y-2">
        {IDS.map((id) => (
          <Check key={id} on={sel.includes(id)} label={SECTIONS[id].label} hint={id === "keys" ? "секретно — включай осознанно" : SECTIONS[id].hint}
            onClick={() => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id])} />
        ))}
      </div>
      <div className="flex gap-2">
        <TapButton size="sm" className="flex-1" onClick={doExport}><Download className="h-4 w-4" /> Экспорт</TapButton>
        <TapButton variant="soft" size="sm" className="flex-1" onClick={() => file.current?.click()}><Upload className="h-4 w-4" /> Импорт</TapButton>
        <input ref={file} type="file" accept="application/json" multiple hidden onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; if (fs.length) void onFiles(fs); }} />
      </div>

      <Dialog open={!!parts} onOpenChange={(o) => !o && setParts(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl">
          <DialogHeader><DialogTitle>Что загрузить из файла?</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {parts && (Object.keys(parts) as SectionId[]).map((id) => (
              <div key={id} className="rounded-2xl border-2 p-3">
                <p className="font-semibold">{SECTIONS[id].label}</p>
                <div className="mt-2 flex rounded-xl bg-muted p-1 text-xs font-semibold">
                  {(["merge", "replace", "skip"] as const).map((k) => (
                    <button key={k} onClick={() => setPlan({ ...plan, [id]: k })} className={cn("flex-1 rounded-lg py-1.5 transition-colors", plan[id] === k ? "bg-card shadow-sm" : "text-muted-foreground")}>
                      {k === "merge" ? "Объединить" : k === "replace" ? "Заменить" : "Пропустить"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <TapButton onClick={() => {
            if (!parts) return;
            const real = Object.fromEntries(Object.entries(plan).filter(([, v]) => v !== "skip")) as Partial<Record<SectionId, Strategy>>;
            applyBackup(parts, real);
            setParts(null);
            toast.success("Данные загружены");
          }}>Загрузить</TapButton>
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
      <div className={row}><span>Голосовые подсказки</span><Switch checked={v.enabled} onCheckedChange={(x) => up({ enabled: x })} /></div>
      <div className={row}><span>Сигналы таймера</span><Switch checked={v.beeps} onCheckedChange={(x) => up({ beeps: x })} /></div>
      <div className={row}><span>«Половина» и «ещё 10 секунд»</span><Switch checked={v.cues} onCheckedChange={(x) => up({ cues: x })} /></div>
      <p className="text-xs text-muted-foreground">Метроном темпа теперь настраивается в каждом упражнении отдельно.</p>
      {voices.length > 0 ? (
        <select className="w-full rounded-2xl border-2 bg-card px-4 py-3" value={v.voiceURI} onChange={(e) => up({ voiceURI: e.target.value })}>
          <option value="">Голос по умолчанию</option>
          {voices.map((x) => <option key={x.voiceURI} value={x.voiceURI}>{x.name}</option>)}
        </select>
      ) : (
        <p className="text-sm text-muted-foreground">Русский голос не найден на устройстве — будет использован системный.</p>
      )}
      <label className="block text-sm">Скорость речи: <b className="tabular">{v.rate.toFixed(2)}</b>
        <Slider className="mt-2" min={0.7} max={1.5} step={0.05} value={[v.rate]} onValueChange={([r]) => up({ rate: r ?? 1 })} />
      </label>
      <label className="block text-sm">Громкость сигналов
        <Slider className="mt-2" min={0.05} max={1} step={0.05} value={[v.volume]} onValueChange={([r]) => up({ volume: r ?? 0.6 })} />
      </label>
      <TapButton variant="soft" size="sm" onClick={() => { primeAudio(); beep("go"); speak("Привет! Я Огонёк. Начинаем тренировку!", { interrupt: true }); }}>
        <Play className="h-4 w-4" /> Проверить звук
      </TapButton>
    </>
  );
}

export function MwCacheInfo() {
  const c = useMwCache();
  const month = new Date().toISOString().slice(0, 7);
  return (
    <div className="flex items-center justify-between rounded-2xl bg-muted px-4 py-3 text-sm">
      <span>
        Запросов в этом месяце: <b className="tabular">{c.month === month ? c.requests : 0}</b>
        <span className="block text-xs text-muted-foreground">В кеше: {Object.keys(c.exercises).length} упр., {Object.keys(c.searches).length} поисков</span>
      </span>
      <button className="font-semibold text-destructive" onClick={() => { c.clear(); toast.success("Кеш очищен"); }}>Очистить</button>
    </div>
  );
}
