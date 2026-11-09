import { useState } from "react";
import { toast } from "sonner";
import { sliceChanged } from "@/lib/settings-draft";
import { SectionCard, field } from "./SectionCard";
import { useSettingsDraft } from "./draft-context";
import { ApiCheck } from "./ApiCheck";
import { checkFfmpegKey } from "@/lib/clients";
import {
  buildFfmpegOptions,
  isNvencOptions,
  joinFfmpegCmd,
  parseFfmpegCmd,
  type FfmpegCodec,
  type FfmpegScale,
} from "@/lib/ffmpeg";
import { DEFAULT_FFMPEG_OPTIONS, DEFAULT_FFMPEG_OUT } from "@/lib/video-rules";
import { type BitrateLevel, type DeviceCodec, type DeviceFps, type TranscodeMode } from "@/lib/video-rules";

/** Video transcode settings; everything waits for the save button. */
export function VideoGroup() {
  const { draft, entry, update, dirty } = useSettingsDraft();

  // Transcode mode switch (new primary control)
  const mode = draft.transcodeMode ?? "device";
  const modeChanged = mode !== entry.transcodeMode;

  // Device path controls
  const [deviceCodec, setDeviceCodec] = useState<DeviceCodec>(draft.deviceCodec ?? "auto");
  const [deviceBitrate, setDeviceBitrate] = useState<BitrateLevel>(draft.deviceBitrate ?? "standard");
  const [deviceFps, setDeviceFps] = useState<DeviceFps>(draft.deviceFps ?? "asis");
  const [fpsConfirmOpen, setFpsConfirmOpen] = useState(false);
  const pendingFps: DeviceFps | null = null;

  // Cloud path controls (existing)
  const [scale, setScale] = useState<FfmpegScale>("1080p");
  const [fps, setFps] = useState("60");
  const [codec, setCodec] = useState<FfmpegCodec>("av1-cpu");
  const cloudChanged = sliceChanged(
    { ffmpegKey: draft.ffmpegKey, ffmpegOptions: draft.ffmpegOptions, ffmpegOut: draft.ffmpegOut },
    {
      ffmpegKey: entry.ffmpegKey,
      ffmpegOptions: entry.ffmpegOptions,
      ffmpegOut: entry.ffmpegOut,
    },
  );
  const [cmdDraft, setCmdDraft] = useState<string | null>(null);
  const cmd = cmdDraft ?? joinFfmpegCmd(draft.ffmpegOptions);

  // Sync local device state with draft when draft changes externally
  if (deviceCodec !== draft.deviceCodec) setDeviceCodec(draft.deviceCodec ?? "auto");
  if (deviceBitrate !== draft.deviceBitrate) setDeviceBitrate(draft.deviceBitrate ?? "standard");
  if (deviceFps !== draft.deviceFps) setDeviceFps(draft.deviceFps ?? "asis");

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

  // FPS 30 confirmation dialog
  const handleFpsChange = (next: DeviceFps) => {
    if (next === "30" && deviceFps === "asis") {
      setFpsConfirmOpen(true);
      // Store pending to apply after confirm
      (window as unknown as { __pendingFps: DeviceFps }).__pendingFps = "30";
    } else {
      setDeviceFps(next);
      update({ deviceFps: next });
    }
  };

  const confirmFps30 = () => {
    setFpsConfirmOpen(false);
    setDeviceFps("30");
    update({ deviceFps: "30" });
    delete (window as unknown as { __pendingFps?: DeviceFps }).__pendingFps;
  };

  return (
    <SectionCard title="Видео: перекодирование" changed={modeChanged || cloudChanged || dirty}>
      {/* Mode switch */}
      <div className="space-y-2">
        <label className="text-sm font-semibold">Режим перекодирования</label>
        <div className="flex gap-2 flex-wrap">
          {(["device", "cloud", "off"] as TranscodeMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => update({ transcodeMode: m })}
              className={`px-3 py-2 rounded-xl text-sm font-semibold transition ${
                mode === m
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {m === "device" && "На устройстве"}
              {m === "cloud" && "Облако (ffmpeg-api.com)"}
              {m === "off" && "Не перекодировать"}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {mode === "device" &&
            "Видео сжимается локально: современный кодек (HEVC/VP9/AV1), переменный битрейт, без потери разрешения. Работает офлайн."}
          {mode === "cloud" &&
            "Короткие видео (до 30 сек) уходят в ffmpeg-api.com с вашим ключом. Нужен интернет. Без ключа — оригинал."}
          {mode === "off" && "Видео сохраняются как есть, без перекодирования."}
        </p>
      </div>

      {/* Device path controls */}
      {mode === "device" && (
        <div className="space-y-4 rounded-2xl bg-muted/50 p-4 border border-border">
          <h4 className="font-semibold text-sm">Настройки на устройстве</h4>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm font-semibold">
              Кодек
              <select
                className={`${select} w-full`}
                value={deviceCodec}
                onChange={(e) => {
                  const v = e.target.value as DeviceCodec;
                  setDeviceCodec(v);
                  update({ deviceCodec: v });
                }}
              >
                <option value="auto">Авто (лучшее сжатие)</option>
                <option value="hevc">HEVC (H.265) — MP4</option>
                <option value="vp9">VP9 — WebM</option>
                <option value="avc">H.264 (AVC) — MP4</option>
                <option value="av1">AV1 — MP4 (только на новых чипах)</option>
              </select>
            </label>

            <label className="space-y-1 text-sm font-semibold">
              Агрессивность сжатия
              <select
                className={`${select} w-full`}
                value={deviceBitrate}
                onChange={(e) => {
                  const v = e.target.value as BitrateLevel;
                  setDeviceBitrate(v);
                  update({ deviceBitrate: v });
                }}
              >
                <option value="standard">Стандарт (~60% от исходного битрейта)</option>
                <option value="max">Максимум (~75-80% от исходного битрейта)</option>
              </select>
            </label>

            <label className="space-y-1 text-sm font-semibold">
              FPS
              <select
                className={`${select} w-full`}
                value={deviceFps}
                onChange={(e) => handleFpsChange(e.target.value as DeviceFps)}
              >
                <option value="asis">Как есть (оригинальные)</option>
                <option value="30">30 fps (после подтверждения)</option>
              </select>
            </label>
          </div>

          <p className="text-sm text-muted-foreground">
            Разрешение видео <strong>никогда не уменьшается</strong> — меняется только кодек и битрейт.
            FPS 30 включается только после явного подтверждения. Для типичных тренировочных роликов
            (мало движения) VBR даёт ~60% экономии при стандартной настройке без заметных потерь.
          </p>

          {/* FPS 30 confirm dialog */}
          {fpsConfirmOpen && (
            <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm">
              <p className="font-semibold text-destructive">Подтвердите понижение FPS до 30</p>
              <p className="text-muted-foreground mt-1">
                Исходный FPS будет ограничен до 30. Это даёт дополнительную экономию места,
                но может сделать движение менее плавным. Оригинальный файл не удаляется —
                можно переимпортировать позже.
              </p>
              <div className="flex justify-end gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setFpsConfirmOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-muted hover:bg-muted/80"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={confirmFps30}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-destructive text-destructive-foreground"
                >
                  Подтвердить
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cloud path controls (existing) */}
      {mode === "cloud" && (
        <div className="space-y-4">
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
        </div>
      )}

      {mode === "off" && (
        <p className="text-sm text-muted-foreground">
          Перекодирование отключено. Все видео сохраняются в исходном формате и качестве.
        </p>
      )}

      {(modeChanged || cloudChanged || dirty) && (
        <p className="text-xs text-muted-foreground">
          Изменения ждут «Сохранить настройки» внизу экрана.
        </p>
      )}
    </SectionCard>
  );
}