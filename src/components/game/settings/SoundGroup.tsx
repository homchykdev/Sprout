import { Play } from "lucide-react";
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { TapButton } from "@/components/game/TapButton";
import { listVoices, primeAudio, beep, fanfare, speak } from "@/lib/voice";
import { cn } from "@/lib/utils";
import { sliceChanged } from "@/lib/settings-draft";
import { SectionCard, selectField } from "./SectionCard";
import { useSettingsDraft } from "./draft-context";

/** Sound and voice — moved from SettingsExtras, now drafts until saved. */
export function SoundGroup() {
  const { draft, entry, updateVoice } = useSettingsDraft();
  const v = draft.voice;
  const changed = sliceChanged(v, entry.voice);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    let active = true;
    const load = () => {
      void listVoices().then((items) => {
        if (active) setVoices(items);
      });
    };
    load();
    if (!Capacitor.isNativePlatform() && typeof speechSynthesis !== "undefined")
      speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      active = false;
      if (!Capacitor.isNativePlatform() && typeof speechSynthesis !== "undefined")
        speechSynthesis.removeEventListener("voiceschanged", load);
    };
  }, []);
  const row = "flex items-center justify-between gap-3";

  return (
    <SectionCard title="Звук и голос" changed={changed}>
      <div className={row}>
        <span>Голосовые подсказки</span>
        <Switch checked={v.enabled} onCheckedChange={(x) => updateVoice({ enabled: x })} />
      </div>
      <div className={row}>
        <span>Сигналы таймера</span>
        <Switch checked={v.beeps} onCheckedChange={(x) => updateVoice({ beeps: x })} />
      </div>
      <div className={row}>
        <span>Метроном темпа</span>
        <Switch checked={v.metronome} onCheckedChange={(x) => updateVoice({ metronome: x })} />
      </div>
      <div className={row}>
        <span>«Половина» и «ещё 10 секунд»</span>
        <Switch checked={v.cues} onCheckedChange={(x) => updateVoice({ cues: x })} />
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
                updateVoice({ theme: t });
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
          className={cn("w-full rounded-2xl px-4 py-3", selectField)}
          value={v.voiceURI}
          onChange={(e) => updateVoice({ voiceURI: e.target.value })}
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
          onValueChange={([r]) => updateVoice({ rate: r ?? 1 })}
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
          onValueChange={([r]) => updateVoice({ volume: r ?? 0.6 })}
        />
      </label>
      <TapButton
        variant="soft"
        size="sm"
        onClick={() => {
          primeAudio();
          beep("go");
          speak(
            draft.name
              ? `Привет, ${draft.name}! Я Огонёк. Начинаем тренировку!`
              : "Привет! Я Огонёк. Начинаем тренировку!",
            {
              interrupt: true,
            },
          );
        }}
      >
        <Play className="h-4 w-4" /> Проверить звук
      </TapButton>
    </SectionCard>
  );
}
