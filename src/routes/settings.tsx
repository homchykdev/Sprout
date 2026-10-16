import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bell, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  ApiCheck,
  DataSection,
  MwCacheInfo,
  SaveCheck,
  VoiceSection,
} from "@/components/game/SettingsExtras";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { TapButton } from "@/components/game/TapButton";
import { notify } from "@/components/game/useReminders";
import { maskKey } from "@/lib/ai-keys";
import { checkAiKeys, checkFfmpegKey, checkMwKey } from "@/lib/clients";
import { useApp } from "@/lib/store";
import {
  buildFfmpegOptions,
  isNvencOptions,
  joinFfmpegCmd,
  parseFfmpegCmd,
  type FfmpegCodec,
  type FfmpegScale,
} from "@/lib/ffmpeg";
import { DEFAULT_FFMPEG_OPTIONS, DEFAULT_FFMPEG_OUT } from "@/lib/video-rules";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Настройки · Пульс" },
      {
        name: "description",
        content: "Напоминания, ключи MuscleWiki и ИИ, экспорт и импорт данных.",
      },
      { property: "og:title", content: "Настройки · Пульс" },
      { property: "og:description", content: "Напоминания, ключи и резервные копии." },
    ],
  }),
  component: Settings,
});

const field =
  "w-full rounded-2xl border-2 bg-card px-4 py-3 text-[15px] outline-none focus:border-primary";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card-soft space-y-3 p-5">
      <h2 className="font-bold">{title}</h2>
      {children}
    </section>
  );
}

/** Multiple AI keys with automatic failover: the first key with remaining quota is used. */
function AiKeys() {
  const ai = useApp((s) => s.ai);
  const set = useApp((s) => s.set);
  const [draft, setDraft] = useState("");
  const add = () => {
    const k = draft.trim();
    if (k.length < 4 || ai.keys.includes(k)) return;
    set({ ai: { ...ai, keys: [...ai.keys, k] } });
    setDraft("");
    toast.success("Ключ добавлен");
  };
  return (
    <div className="space-y-2">
      {ai.keys.map((k, i) => (
        <div
          key={`${i}-${k.slice(-6)}`}
          className="flex items-center gap-2 rounded-2xl border-2 px-4 py-2.5"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
            {i + 1}
          </span>
          <span className="flex-1 font-mono text-sm">{maskKey(k)}</span>
          <button
            aria-label={`Удалить ключ ${i + 1}`}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted"
            onClick={() => set({ ai: { ...ai, keys: ai.keys.filter((_, j) => j !== i) } })}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          className={field}
          type="password"
          placeholder={ai.keys.length ? "Ещё один ключ (запасной)" : "API-ключ"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <TapButton size="sm" variant="soft" onClick={add} disabled={draft.trim().length < 4}>
          <Plus className="h-4 w-4" />
        </TapButton>
      </div>
      <p className="text-sm text-muted-foreground">
        {ai.keys.length
          ? "Ключи используются по порядку: если у первого кончился лимит, приложение само перейдёт на следующий."
          : "Без ключа ИИ-функции недоступны. Можно добавить несколько — они будут подменять друг друга при исчерпании лимита."}
      </p>
    </div>
  );
}

function Settings() {
  const s = useApp();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pt-2">
        <Link to="/" className="press -ml-2 rounded-full p-2 hover:bg-muted" aria-label="Назад">
          <ArrowLeft />
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight">Настройки</h1>
      </div>

      <Section title="Профиль">
        <input
          className={field}
          placeholder="Как тебя зовут?"
          value={s.name}
          onChange={(e) => s.set({ name: e.target.value })}
        />
      </Section>

      <Section title="Напоминания">
        <div className="flex items-center justify-between">
          <span>Напоминать о тренировках</span>
          <Switch
            checked={s.reminders.enabled}
            onCheckedChange={(v) => s.set({ reminders: { ...s.reminders, enabled: v } })}
          />
        </div>
        <label className="flex items-center justify-between">
          <span>Первое напоминание в</span>
          <select
            className="rounded-xl border-2 px-3 py-2"
            value={s.reminders.hour}
            onChange={(e) => s.set({ reminders: { ...s.reminders, hour: +e.target.value } })}
          >
            {Array.from({ length: 17 }, (_, i) => i + 6).map((h) => (
              <option key={h} value={h}>
                {h}:00
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-muted-foreground">
          Если не потренируешься — Пульс напомнит ещё через 2 и 4 часа. Уведомления работают, пока
          приложение открыто или установлено на главный экран.
        </p>
        <TapButton
          variant="soft"
          size="sm"
          onClick={async () => {
            if (typeof Notification === "undefined") {
              toast.error("Браузер не поддерживает уведомления");
              return;
            }
            const p = await Notification.requestPermission();
            if (p !== "granted") {
              toast.error("Уведомления запрещены в браузере");
              return;
            }
            await notify("Огонёк на связи 💪", "Теперь я буду напоминать о тренировках!");
          }}
        >
          <Bell className="h-4 w-4" /> Разрешить уведомления
        </TapButton>
      </Section>

      <Section title="Звук и голос">
        <VoiceSection />
      </Section>

      <Section title="MuscleWiki">
        <input
          className={field}
          type="password"
          placeholder="mw_…"
          value={s.mwKey}
          onChange={(e) => s.set({ mwKey: e.target.value.trim() })}
        />
        <p className="text-sm text-muted-foreground">
          Ключ хранится только на этом устройстве. Используется для импорта упражнений с видео.
          Ответы сохраняются на устройстве, чтобы не тратить лимит.
        </p>
        <ApiCheck label="Проверить ключ" check={checkMwKey} />
        <MwCacheInfo />
      </Section>

      <Section title="ИИ-помощник">
        <div className="flex rounded-2xl bg-muted p-1 text-sm font-semibold">
          {(["gemini", "openai"] as const).map((p) => (
            <button
              key={p}
              onClick={() =>
                s.set({
                  ai: {
                    ...s.ai,
                    provider: p,
                    model: p === "gemini" ? "gemini-2.5-flash" : "gpt-4o-mini",
                  },
                })
              }
              className={`flex-1 rounded-xl py-2 transition-colors ${s.ai.provider === p ? "bg-card shadow-sm" : "text-muted-foreground"}`}
            >
              {p === "gemini" ? "Google Gemini" : "OpenAI-совместимый"}
            </button>
          ))}
        </div>
        <AiKeys />
        {s.ai.provider === "openai" && (
          <input
            className={field}
            placeholder="Base URL, напр. https://api.openai.com/v1"
            value={s.ai.baseUrl}
            onChange={(e) => s.set({ ai: { ...s.ai, baseUrl: e.target.value.trim() } })}
          />
        )}
        <input
          className={field}
          placeholder="Модель"
          value={s.ai.model}
          onChange={(e) => s.set({ ai: { ...s.ai, model: e.target.value.trim() } })}
        />
        <p className="text-sm text-muted-foreground">
          ИИ создаёт и улучшает упражнения и составляет тренировки. Ключи хранятся только на
          устройстве.
        </p>
        <ApiCheck label="Проверить ключи" check={checkAiKeys} />
      </Section>

      <Section title="Видео: перекодирование">
        <input
          className={field}
          type="password"
          placeholder="Ключ ffmpeg-api.com"
          value={s.ffmpegKey}
          onChange={(e) => s.set({ ffmpegKey: e.target.value.trim() })}
        />
        <p className="text-sm text-muted-foreground">
          Короткие видео (до 30 сек) перекодируются через облако ffmpeg-api.com — бесплатно до 10 ГБ
          обработок в месяц. Ключ хранится только на этом устройстве. Без ключа видео сохраняются
          как есть.
        </p>
        <ApiCheck label="Проверить ключ" check={checkFfmpegKey} />
        <VideoTranscode />
      </Section>

      <Section title="Данные">
        <DataSection />
        <p className="text-sm text-muted-foreground">
          Все данные хранятся на устройстве. Делай резервную копию, чтобы перенести прогресс.
        </p>
        <button
          className="text-sm font-semibold text-destructive"
          onClick={() => confirm("Удалить все данные безвозвратно?") && s.resetAll()}
        >
          Сбросить всё
        </button>
      </Section>

      <SaveCheck />
    </div>
  );
}

/**
 * Tunable cloud-transcode settings: quick presets (resolution/fps/codec/
 * container) plus an Advanced textarea with the raw ffmpeg-api.com options.
 * Everything stays on-device and is included in the keys backup.
 */
function VideoTranscode() {
  const s = useApp();
  const [scale, setScale] = useState<FfmpegScale>("1080p");
  const [fps, setFps] = useState("60");
  const [codec, setCodec] = useState<FfmpegCodec>("av1-nvenc");
  // Null = not editing: textarea mirrors the store; any keystroke takes over.
  const [draft, setDraft] = useState<string | null>(null);
  const cmd = draft ?? joinFfmpegCmd(s.ffmpegOptions);

  const applyPreset = (sc: FfmpegScale, f: string, c: FfmpegCodec) => {
    setScale(sc);
    setFps(f);
    setCodec(c);
    setDraft(null);
    s.set({ ffmpegOptions: buildFfmpegOptions(sc, +f, c) });
  };
  const onCmd = (v: string) => {
    setDraft(v);
    const parsed = parseFfmpegCmd(v);
    // Empty input keeps the previous working options.
    if (parsed.length) s.set({ ffmpegOptions: parsed });
  };
  const reset = () => {
    setScale("1080p");
    setFps("60");
    setCodec("av1-nvenc");
    setDraft(null);
    s.set({ ffmpegOptions: [...DEFAULT_FFMPEG_OPTIONS], ffmpegOut: DEFAULT_FFMPEG_OUT });
    toast.success("Параметры перекодирования сброшены");
  };

  const select = "rounded-xl border-2 bg-card px-3 py-2 text-sm font-semibold";
  return (
    <div className="space-y-3 rounded-2xl bg-muted/50 p-4">
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-sm font-semibold">
          Разрешение
          <select
            className={`${select} w-full`}
            value={scale}
            onChange={(e) => applyPreset(e.target.value as FfmpegScale, fps, codec)}
          >
            <option value="original">Оригинал</option>
            <option value="480p">480p</option>
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
          </select>
        </label>
        <label className="space-y-1 text-sm font-semibold">
          FPS
          <select
            className={select + " w-full"}
            value={fps}
            onChange={(e) => applyPreset(scale, e.target.value, codec)}
          >
            <option value="10">10</option>
            <option value="30">30</option>
            <option value="60">60</option>
          </select>
        </label>
        <label className="space-y-1 text-sm font-semibold">
          Кодек
          <select
            className={`${select} w-full`}
            value={codec}
            onChange={(e) => applyPreset(scale, fps, e.target.value as FfmpegCodec)}
          >
            <option value="av1-nvenc">AV1 · NVIDIA</option>
            <option value="av1-cpu">AV1 · CPU</option>
            <option value="h264-cpu">H.264 · CPU</option>
          </select>
        </label>
        <label className="space-y-1 text-sm font-semibold">
          Контейнер
          <select
            className={`${select} w-full`}
            value={s.ffmpegOut}
            onChange={(e) => s.set({ ffmpegOut: e.target.value.trim().toLowerCase() || "webm" })}
          >
            <option value="webm">webm</option>
            <option value="mp4">mp4</option>
          </select>
        </label>
      </div>
      <details className="space-y-2">
        <summary className="cursor-pointer text-sm font-bold text-primary">
          Advanced: команда ffmpeg
        </summary>
        <textarea
          className={`${field} font-mono text-[13px]`}
          rows={4}
          spellCheck={false}
          value={cmd}
          onChange={(e) => onCmd(e.target.value)}
          aria-label="Параметры ffmpeg для ffmpeg-api.com"
        />
        <p className="text-sm text-muted-foreground">
          Аргументов: {s.ffmpegOptions.length}. Кавычки для значений с пробелами поддерживаются.
          Пустое поле оставляет предыдущие параметры.
        </p>
      </details>
      {isNvencOptions(s.ffmpegOptions) && (
        <p className="text-sm text-muted-foreground">
          В документации облака GPU не заявлен: если NVIDIA там нет, повторю конвертацию на CPU
          (libsvtav1) автоматически.
        </p>
      )}
      <div className="flex justify-end">
        <button className="text-sm font-semibold text-muted-foreground" onClick={reset}>
          Сбросить к умолчанию
        </button>
      </div>
    </div>
  );
}
