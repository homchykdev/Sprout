import { useEffect, useState } from "react";
import { Copy, Download, RefreshCw, Share2, Trash2, CheckCircle, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { App } from "@capacitor/app";
import { TextToSpeech } from "@/lib/native-tts";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { ScreenOrientation } from "@capacitor/screen-orientation";
import { Motion } from "@capacitor/motion";
import { Switch } from "@/components/ui/switch";
import { TapButton } from "@/components/game/TapButton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SectionCard } from "./SectionCard";
import { exportDebugLogs, getDebugLogs, clearDebugLogs, installDebugLog, getDebugLogStatus } from "@/lib/debug-log";
import { cn } from "@/lib/utils";

const time = (ts: number) =>
  new Date(ts).toLocaleString([], {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const levelColor: Record<string, string> = {
  log: "text-muted-foreground",
  info: "text-foreground",
  warn: "text-flame-shade",
  error: "text-destructive",
};

const levelIcon: Record<string, React.ReactNode> = {
  log: <span className="text-muted-foreground">●</span>,
  info: <CheckCircle className="h-3 w-3 text-foreground" />,
  warn: <AlertTriangle className="h-3 w-3 text-flame-shade" />,
  error: <XCircle className="h-3 w-3 text-destructive" />,
};

interface PendingNotification {
  id: number;
  title: string;
  body: string;
  schedule?: { at: string | Date };
}

export function DiagnosticsGroup() {
  const [logs, setLogs] = useState<ReturnType<typeof getDebugLogs>>([]);
  const [preview, setPreview] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Platform info
  const [platformInfo, setPlatformInfo] = useState<Record<string, string>>({});
  // Notifications
  const [permStatus, setPermStatus] = useState<{ display: string } | null>(null);
  const [exactAlarmStatus, setExactAlarmStatus] = useState<{ value: string } | null>(null);
  const [pendingNotifs, setPendingNotifs] = useState<PendingNotification[]>([]);
  const [testNotifLoading, setTestNotifLoading] = useState(false);
  // TTS
  const [ttsInfo, setTtsInfo] = useState<{ webVoices: number; nativeVoices: number; nativeVoicesList: string[] }>({
    webVoices: 0,
    nativeVoices: 0,
    nativeVoicesList: [],
  });
  // Camera
  const [cameraInfo, setCameraInfo] = useState<{
    videoWidth: number;
    videoHeight: number;
    trackSettings: MediaTrackSettings | null;
    rotateFeed: boolean;
    previewSize: { width: number; height: number } | null;
    error: string | null;
  }>({
    videoWidth: 0,
    videoHeight: 0,
    trackSettings: null,
    rotateFeed: false,
    previewSize: null,
    error: null,
  });
  const [cameraLoading, setCameraLoading] = useState(false);
  // Motion
  const [motionInfo, setMotionInfo] = useState<{ accelerometer: boolean; orientation: boolean; error: string | null }>({
    accelerometer: false,
    orientation: false,
    error: null,
  });
  const [motionLoading, setMotionLoading] = useState(false);
  // Screen Orientation
  const [screenOrientationInfo, setScreenOrientationInfo] = useState<{
    type: string;
    angle: number;
    lockSupported: boolean;
  }>({ type: "", angle: 0, lockSupported: false });

  useEffect(() => {
    installDebugLog();
    refreshLogs();
    loadPlatformInfo();
    loadNotificationStatus();
    loadTTSInfo();
    loadScreenOrientation();
  }, []);

  useEffect(() => {
    const t = setInterval(refreshLogs, 2000);
    return () => clearInterval(t);
  }, []);

  const refreshLogs = () => setLogs(getDebugLogs());

  const loadPlatformInfo = () => {
    const info: Record<string, string> = {
      platform: Capacitor.getPlatform(),
      isNative: String(Capacitor.isNativePlatform()),
      userAgent: navigator.userAgent,
      screenWidth: String(window.screen.width),
      screenHeight: String(window.screen.height),
      innerWidth: String(window.innerWidth),
      innerHeight: String(window.innerHeight),
      devicePixelRatio: String(window.devicePixelRatio),
      visualViewportWidth: String(window.visualViewport?.width ?? "n/a"),
      visualViewportHeight: String(window.visualViewport?.height ?? "n/a"),
      visualViewportScale: String(window.visualViewport?.scale ?? "n/a"),
      visualViewportOffsetX: String(window.visualViewport?.offsetLeft ?? "n/a"),
      visualViewportOffsetY: String(window.visualViewport?.offsetTop ?? "n/a"),
      language: navigator.language,
      cookieEnabled: String(navigator.cookieEnabled),
      onLine: String(navigator.onLine),
      hardwareConcurrency: String(navigator.hardwareConcurrency ?? "n/a"),
      maxTouchPoints: String(navigator.maxTouchPoints ?? 0),
    };
    setPlatformInfo(info);
  };

  const loadNotificationStatus = async () => {
    if (!Capacitor.isNativePlatform()) {
      setPermStatus({ display: "web (not applicable)" });
      setExactAlarmStatus({ value: "web (not applicable)" });
      return;
    }
    try {
      const perm = await LocalNotifications.checkPermissions();
      setPermStatus(perm);
      // checkExactNotificationSetting is not directly exposed in v8 types,
      // but we can try to call it via the plugin bridge if available
      // For now, we'll note it's not directly accessible
      setExactAlarmStatus({ value: "check via native plugin if available" });
      const pending = await LocalNotifications.getPending();
      const managed = pending.notifications
        .filter((n) => n.id >= 200001010 && n.id <= 219912319) // our ID range
        .slice(0, 5)
        .map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          schedule: n.schedule,
        }));
      setPendingNotifs(managed);
    } catch (e) {
      console.error("Failed to load notification status", e);
      setPermStatus({ display: "error" });
    }
  };

  const loadTTSInfo = async () => {
    // Web voices
    let webVoices = 0;
    if (typeof speechSynthesis !== "undefined") {
      webVoices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("ru")).length;
    }

    // Native voices
    let nativeVoices = 0;
    let nativeVoicesList: string[] = [];
    if (Capacitor.isNativePlatform()) {
      try {
        const result = await TextToSpeech.getSupportedVoices();
        nativeVoices = result.voices.filter((v: { lang: string }) => v.lang.toLowerCase().startsWith("ru")).length;
        nativeVoicesList = result.voices
          .filter((v: { lang: string }) => v.lang.toLowerCase().startsWith("ru"))
          .map((v: { name: string; lang: string; voiceURI: string }) => `${v.name} (${v.lang}) [${v.voiceURI}]`);
      } catch (e) {
        console.error("Failed to load native TTS voices", e);
      }
    }

    setTtsInfo({ webVoices, nativeVoices, nativeVoicesList });
  };

  const loadScreenOrientation = async () => {
    const type = screen.orientation?.type ?? "unknown";
    const angle = screen.orientation?.angle ?? 0;
    let lockSupported = false;
    if (Capacitor.isNativePlatform()) {
      try {
        const orientations = await ScreenOrientation.orientations();
        lockSupported = true;
        setScreenOrientationInfo({ type, angle, lockSupported });
        return;
      } catch {
        // fall through
      }
    }
    setScreenOrientationInfo({ type, angle, lockSupported });
  };

  const handleTestNotification = async () => {
    if (!Capacitor.isNativePlatform()) {
      toast.error("Доступно только в нативной сборке");
      return;
    }
    setTestNotifLoading(true);
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== "granted") {
        const req = await LocalNotifications.requestPermissions();
        if (req.display !== "granted") {
          toast.error("Разрешение на уведомления не выдано");
          return;
        }
      }
      const at = new Date(Date.now() + 60_000);
      await LocalNotifications.schedule({
        notifications: [
          {
            id: 999999,
            title: "Тестовое уведомление",
            body: "Пришло через 1 минуту — диагностика работает",
            schedule: { at, allowWhileIdle: true },
            channelId: "reminders",
          },
        ],
      });
      toast.success("Уведомление запланировано на через 1 минуту");
      await loadNotificationStatus();
    } catch (e) {
      console.error("Test notification failed", e);
      toast.error("Не удалось запланировать: " + String(e));
    } finally {
      setTestNotifLoading(false);
    }
  };

  const handleTestCamera = async () => {
    if (!Capacitor.isNativePlatform()) {
      toast.error("Проверка камеры работает только в нативной сборке (Capacitor Camera plugin)");
      return;
    }
    setCameraLoading(true);
    setCameraInfo((prev) => ({ ...prev, error: null }));
    try {
      const result = await Camera.getPhoto({
        quality: 50,
        width: 640,
        height: 480,
        source: CameraSource.Camera,
        resultType: CameraResultType.Uri,
        saveToGallery: false,
      });

      // Try to get stream settings via getUserMedia for detailed info
      let trackSettings: MediaTrackSettings | null = null;
      let videoWidth = 0;
      let videoHeight = 0;
      let rotateFeed = false;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "user" }, width: { ideal: 1440 }, height: { ideal: 1920 } },
        });
        const track = stream.getVideoTracks()[0];
        if (track) {
          trackSettings = track.getSettings();
          const video = document.createElement("video");
          video.srcObject = stream;
          await video.play();
          await new Promise((r) => setTimeout(r, 100));
          videoWidth = video.videoWidth;
          videoHeight = video.videoHeight;
          const bounds = { width: window.innerWidth, height: window.innerHeight };
          rotateFeed = videoWidth > videoHeight !== bounds.width > bounds.height;
          stream.getTracks().forEach((t) => t.stop());
        }
      } catch (e) {
        console.warn("getUserMedia details failed", e);
      }

      setCameraInfo({
        videoWidth,
        videoHeight,
        trackSettings,
        rotateFeed,
        previewSize: { width: window.innerWidth, height: window.innerHeight },
        error: null,
      });
      toast.success("Камера проверена");
    } catch (e) {
      console.error("Camera test failed", e);
      setCameraInfo((prev) => ({ ...prev, error: String(e) }));
      toast.error("Ошибка камеры: " + String(e));
    } finally {
      setCameraLoading(false);
    }
  };

  const handleTestMotion = async () => {
    if (!Capacitor.isNativePlatform()) {
      toast.error("Доступно только в нативной сборке");
      return;
    }
    setMotionLoading(true);
    setMotionInfo((prev) => ({ ...prev, error: null }));
    try {
      // Test accelerometer
      let accelerometer = false;
      let orientation = false;
      try {
        const accelListener = await Motion.addListener("accel", () => {});
        accelerometer = true;
        accelListener.remove();
      } catch {
        // not available
      }
      try {
        const orientListener = await Motion.addListener("orientation", () => {});
        orientation = true;
        orientListener.remove();
      } catch {
        // not available
      }
      setMotionInfo({ accelerometer, orientation, error: null });
      toast.success("Датчики проверены");
    } catch (e) {
      console.error("Motion test failed", e);
      setMotionInfo((prev) => ({ ...prev, error: String(e) }));
      toast.error("Ошибка датчиков: " + String(e));
    } finally {
      setMotionLoading(false);
    }
  };

  const downloadLogs = () => {
    const text = exportDebugLogs();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sprout-debug-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast.success("Файл сохранён");
  };

  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(exportDebugLogs());
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
      toast.success("Логи скопированы в буфер");
    } catch (e) {
      toast.error("Не удалось скопировать — скачай файл");
    }
  };

  const clearLogs = () => {
    clearDebugLogs();
    refreshLogs();
    setConfirmClear(false);
    toast.success("Логи очищены");
  };

  const last = logs.at(-1);
  const status = getDebugLogStatus();

  return (
    <SectionCard
      title="Диагностика устройства"
      hint="Полный отчёт о платформе, уведомлениях, TTS, камере и датчиках. Скопируй или скачай лог и пришли в чат для анализа."
    >
      {/* Debug Log Status */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Журнал отладки</p>
            <p className="text-sm text-muted-foreground">
              записей: <b className="tabular text-foreground">{logs.length} / {status.bufferSize}</b>
              {last && <>{" "}· последняя <b className="tabular text-foreground">{time(last.ts)}</b></>}
              {" "}· установлен: <b className={status.installed ? "text-green-600" : "text-red-600"}>
                {status.installed ? "да" : "нет"}
              </b>
              {" "}· восстановлен: <b className={status.restored ? "text-green-600" : "text-red-600"}>
                {status.restored ? "да" : "нет"}
              </b>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <TapButton size="sm" className="min-h-[44px]" onClick={downloadLogs}>
              <Download className="h-4 w-4" /> Экспорт
            </TapButton>
            <TapButton variant="soft" size="sm" className="min-h-[44px]" onClick={copyLogs}>
              <Copy className="h-4 w-4" /> {copySuccess ? "Скопировано!" : "Копировать"}
            </TapButton>
            <TapButton variant="soft" size="sm" className="min-h-[44px] text-destructive" onClick={() => setConfirmClear(true)}>
              <Trash2 className="h-4 w-4" /> Очистить
            </TapButton>
          </div>
        </div>

        <Dialog open={preview} onOpenChange={setPreview}>
          <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-3xl">
            <DialogHeader>
              <DialogTitle>Последние записи журнала</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 font-mono text-xs">
              {logs
                .slice(-100)
                .reverse()
                .map((e, i) => (
                  <div key={`${e.ts}-${i}`} className="rounded-xl bg-muted p-2">
                    <div className="flex items-center gap-2">
                      {levelIcon[e.level]}
                      <span className={`font-bold ${levelColor[e.level]}`}>[{e.level.toUpperCase()}]</span>
                      <span className="text-muted-foreground tabular">{time(e.ts)}</span>
                    </div>
                    <p className="mt-1 break-words">{e.args.map((a) => String(a)).join(" ")}</p>
                  </div>
                ))}
              {logs.length === 0 && <p className="text-center text-muted-foreground py-8">Журнал пуст</p>}
            </div>
          </DialogContent>
        </Dialog>

        <DialogTrigger asChild>
          <button
            className="text-sm font-semibold text-foreground hover:underline"
            onClick={() => setPreview(true)}
            disabled={logs.length === 0}
          >
            Посмотреть последние 100 записей
          </button>
        </DialogTrigger>

        <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
          <DialogContent className="rounded-3xl">
            <DialogHeader>
              <DialogTitle>Очистить журнал?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">Все {logs.length} записей будут удалены безвозвратно.</p>
            <TapButton variant="soft" className="w-full text-destructive" onClick={clearLogs}>
              Удалить журнал
            </TapButton>
          </DialogContent>
        </Dialog>
      </div>

      {/* Platform Info */}
      <div className="border-t border-border pt-4 space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <RefreshCw className="h-4 w-4" /> Платформа и окружение
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          {Object.entries(platformInfo).map(([key, value]) => (
            <div key={key} className="rounded-xl bg-muted p-3">
              <p className="text-muted-foreground truncate">{key}</p>
              <p className="font-mono text-foreground break-all">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Notifications */}
      <div className="border-t border-border pt-4 space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <RefreshCw className="h-4 w-4" onClick={loadNotificationStatus} className="cursor-pointer hover:opacity-70" />
          Уведомления
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          <div className="rounded-xl bg-muted p-3">
            <p className="text-muted-foreground">Разрешение (display)</p>
            <p className="font-mono text-foreground">{permStatus?.display ?? "—"}</p>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <p className="text-muted-foreground">Exact Alarm Setting</p>
            <p className="font-mono text-foreground">{exactAlarmStatus?.value ?? "—"}</p>
          </div>
        </div>
        {pendingNotifs.length > 0 && (
          <div className="rounded-xl bg-muted p-3">
            <p className="text-sm font-medium mb-2">Ближайшие запланированные (до 5):</p>
            <div className="space-y-1 font-mono text-xs">
              {pendingNotifs.map((n) => (
                <div key={n.id} className="flex items-center gap-2 text-white/80">
                  <span className="tabular">#{n.id}</span>
                  <span>{n.title}</span>
                  <span className="text-white/50">—</span>
                  <span>{n.body}</span>
                  {n.schedule && (
                    <span className="text-white/40 ml-auto">
                      @ {new Date(n.schedule.at).toLocaleString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <TapButton
          variant="soft"
          size="sm"
          className="min-h-[44px]"
          onClick={handleTestNotification}
          disabled={testNotifLoading || !Capacitor.isNativePlatform()}
        >
          {testNotifLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Тестовое уведомление через 1 мин</span>}
        </TapButton>
        {!Capacitor.isNativePlatform() && (
          <p className="text-xs text-muted-foreground">Доступно только в нативной сборке (Capacitor)</p>
        )}
      </div>

      {/* TTS */}
      <div className="border-t border-border pt-4 space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <RefreshCw className="h-4 w-4" onClick={loadTTSInfo} className="cursor-pointer hover:opacity-70" />
          TTS (речь)
        </h3>
        <div className="grid gap-2 sm:grid-cols-3 text-sm">
          <div className="rounded-xl bg-muted p-3">
            <p className="text-muted-foreground">Web Speech (русские)</p>
            <p className="font-mono text-foreground">{ttsInfo.webVoices}</p>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <p className="text-muted-foreground">Native TTS (русские)</p>
            <p className="font-mono text-foreground">{ttsInfo.nativeVoices}</p>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <p className="text-muted-foreground">Capacitor.isNativePlatform()</p>
            <p className="font-mono text-foreground">{String(Capacitor.isNativePlatform())}</p>
          </div>
        </div>
        {ttsInfo.nativeVoicesList.length > 0 && (
          <div className="rounded-xl bg-muted p-3">
            <p className="text-sm font-medium mb-2">Нативные голоса:</p>
            <div className="space-y-1 font-mono text-xs text-white/80">
              {ttsInfo.nativeVoicesList.map((v, i) => (
                <div key={i}>{v}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Camera */}
      <div className="border-t border-border pt-4 space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <RefreshCw className="h-4 w-4" onClick={handleTestCamera} className="cursor-pointer hover:opacity-70" />
          Камера
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div className="rounded-xl bg-muted p-3">
            <p className="text-muted-foreground">videoWidth</p>
            <p className="font-mono text-foreground">{cameraInfo.videoWidth || "—"}</p>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <p className="text-muted-foreground">videoHeight</p>
            <p className="font-mono text-foreground">{cameraInfo.videoHeight || "—"}</p>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <p className="text-muted-foreground">rotateFeed</p>
            <p className="font-mono text-foreground">{String(cameraInfo.rotateFeed)}</p>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <p className="text-muted-foreground">preview (CSS)</p>
            <p className="font-mono text-foreground">
              {cameraInfo.previewSize ? `${cameraInfo.previewSize.width}x${cameraInfo.previewSize.height}` : "—"}
            </p>
          </div>
        </div>
        {cameraInfo.trackSettings && (
          <div className="rounded-xl bg-muted p-3">
            <p className="text-sm font-medium mb-2">Track settings (getUserMedia):</p>
            <div className="grid gap-1 sm:grid-cols-2 text-xs font-mono text-white/80">
              {Object.entries(cameraInfo.trackSettings).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-white/50">{k}</span>
                  <span>{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {cameraInfo.error && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            Ошибка: {cameraInfo.error}
          </div>
        )}
        <TapButton
          variant="soft"
          size="sm"
          className="min-h-[44px]"
          onClick={handleTestCamera}
          disabled={cameraLoading || !Capacitor.isNativePlatform()}
        >
          {cameraLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Проверить камеру (Capacitor Camera)</span>}
        </TapButton>
        {!Capacitor.isNativePlatform() && (
          <p className="text-xs text-muted-foreground">Capacitor Camera plugin требует нативной сборки</p>
        )}
      </div>

      {/* Motion Sensors */}
      <div className="border-t border-border pt-4 space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <RefreshCw className="h-4 w-4" onClick={handleTestMotion} className="cursor-pointer hover:opacity-70" />
          Датчики движения (@capacitor/motion)
        </h3>
        <div className="grid gap-2 sm:grid-cols-3 text-sm">
          <div className="rounded-xl bg-muted p-3">
            <p className="text-muted-foreground">Accelerometer</p>
            <p className="font-mono text-foreground">{motionInfo.accelerometer ? "✓ доступен" : "✗ нет"}</p>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <p className="text-muted-foreground">Orientation</p>
            <p className="font-mono text-foreground">{motionInfo.orientation ? "✓ доступен" : "✗ нет"}</p>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <p className="text-muted-foreground">Web API (DeviceMotionEvent)</p>
            <p className="font-mono text-foreground">{typeof DeviceMotionEvent !== "undefined" ? "✓" : "✗"}</p>
          </div>
        </div>
        {motionInfo.error && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            Ошибка: {motionInfo.error}
          </div>
        )}
        <TapButton
          variant="soft"
          size="sm"
          className="min-h-[44px]"
          onClick={handleTestMotion}
          disabled={motionLoading || !Capacitor.isNativePlatform()}
        >
          {motionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Проверить датчики</span>}
        </TapButton>
        {!Capacitor.isNativePlatform() && (
          <p className="text-xs text-muted-foreground">Доступно только в нативной сборке</p>
        )}
      </div>

      {/* Screen Orientation */}
      <div className="border-t border-border pt-4 space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <RefreshCw className="h-4 w-4" onClick={loadScreenOrientation} className="cursor-pointer hover:opacity-70" />
          Ориентация экрана (@capacitor/screen-orientation)
        </h3>
        <div className="grid gap-2 sm:grid-cols-3 text-sm">
          <div className="rounded-xl bg-muted p-3">
            <p className="text-muted-foreground">Тип (web)</p>
            <p className="font-mono text-foreground">{screenOrientationInfo.type || "—"}</p>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <p className="text-muted-foreground">Угол (web)</p>
            <p className="font-mono text-foreground">{String(screenOrientationInfo.angle)}°</p>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <p className="text-muted-foreground">Lock supported (native)</p>
            <p className="font-mono text-foreground">{String(screenOrientationInfo.lockSupported)}</p>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}