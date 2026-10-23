import { useState } from "react";
import { toast } from "sonner";
import { SectionCard, field } from "./SectionCard";
import { useSettingsDraft } from "./draft-context";
import { ApiCheck } from "./ApiCheck";
import { DEFAULT_FFMPEG_OPTIONS, DEFAULT_FFMPEG_OUT } from "@/lib/video-rules";
import { checkFfmpegKey } from "@/lib/clients";
import {
  buildFfmpegOptions,
  isNvencOptions,
  joinFfmpegCmd,
  parseFfmpegCmd,
  type FfmpegCodec,
  type FfmpegScale,
} from "@/lib/ffmpeg";

/** Cloud video transcode settings; everything waits for the save button. */
export function VideoGroup() {
  const { draft, update, dirty } = useSettingsDraft();
  const [scale, setScale] = useState<FfmpegScale>("1080p");
  const [fps, setFps] = useState("60");
  const [codec, setCodec] = useState<FfmpegCodec>("av1-cpu");
  // Null = not editing: textarea mirrors the draft; any keystroke takes over.
  const [cmdDraft, setCmdDraft] = useState<string | null>(null);
  const cmd = cmdDraft ?? joinFfmpegCmd(draft.ffmpegOptions);

  const applyPreset = (sc: FfmpegScale, f: string, c: FfmpegCodec) => {
    setScale(sc);
    setFps(f);
    setCodec(c);
    setCmdDraft(null);
    update({ ffmpegOptions: buildFfmpegOptions(sc, +f, c) });
  };
  const onCmd = (v: string) => {
    setCmdDraft(v);
    const parsed = parseFfmpegCmd(v);
    // Empty input keeps the previous working options.
    if (parsed.length) update({ ffmpegOptions: parsed });
  };
  const reset = () => {
    setScale("1080p");
    setFps("60");
    setCodec("av1-cpu");
    setCmdDraft(null);
    update({ ffmpegOptions: [...DEFAULT_FFMPEG_OPTIONS], ffmpegOut: DEFAULT_FFMPEG_OUT });
    toast.success("Параметры в черновике сброшены");
  };

  const select = "rounded-xl border-2 bg-card px-3 py-2 text-sm font-semibold";
  return (
    <SectionCard title="Видео: перекодирование">
      <input
        className={field}
        type="password"
        placeholder="Ключ ffmpeg-api.com"
        value={draft.ffmpegKey}
        onChange={(e) => update({ ffmpegKey: e.target.value.trim() })}
        aria-label="Ключ ffmpeg-api.com"
      />
      <p className="text-sm text-muted-foreground">
        Короткие видео (до 30 сек) перекодируются через облако ffmpeg-api.com — бесплатно до 10 ГБ
        обработок в месяц. Ключ хранится только на этом устройстве. Без ключа видео сохраняются как
        есть.
      </p>
      <ApiCheck
        label="Проверить ключ"
        check={() => checkFfmpegKey(draft.ffmpegKey)}
        disabled={!draft.ffmpegKey}
      />
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
              value={draft.ffmpegOut}
              onChange={(e) => update({ ffmpegOut: e.target.value.trim().toLowerCase() || "webm" })}
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
            Аргументов: {draft.ffmpegOptions.length}. Кавычки для значений с пробелами
            поддерживаются. Пустое поле оставляет предыдущие параметры.
          </p>
        </details>
        {isNvencOptions(draft.ffmpegOptions) && (
          <p className="text-sm text-muted-foreground">
            Проверка через playground показала: NVIDIA в облаке нет. Такую задачу всё равно
            попробую, а при ошибке автоматически повторю на CPU (libsvtav1).
          </p>
        )}
        <div className="flex justify-end">
          <button className="text-sm font-semibold text-muted-foreground" onClick={reset}>
            Сбросить к умолчанию
          </button>
        </div>
      </div>
      {dirty && (
        <p className="text-xs text-muted-foreground">
          Изменения ждут «Сохранить настройки» внизу экрана.
        </p>
      )}
    </SectionCard>
  );
}
