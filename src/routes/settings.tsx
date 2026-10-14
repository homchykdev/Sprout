import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bell } from "lucide-react";
import { DataSection, MwCacheInfo, VoiceSection } from "@/components/game/SettingsExtras";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { TapButton } from "@/components/game/TapButton";
import { notify } from "@/components/game/useReminders";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Настройки · Пульс" },
      { name: "description", content: "Напоминания, ключи MuscleWiki и ИИ, экспорт и импорт данных." },
      { property: "og:title", content: "Настройки · Пульс" },
      { property: "og:description", content: "Напоминания, ключи и резервные копии." },
    ],
  }),
  component: Settings,
});

const field = "w-full rounded-2xl border-2 bg-card px-4 py-3 text-[15px] outline-none focus:border-primary";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card-soft space-y-3 p-5">
      <h2 className="font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Settings() {
  const s = useApp();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pt-2">
        <Link to="/" className="press -ml-2 rounded-full p-2 hover:bg-muted" aria-label="Назад"><ArrowLeft /></Link>
        <h1 className="text-3xl font-extrabold tracking-tight">Настройки</h1>
      </div>

      <Section title="Профиль">
        <input className={field} placeholder="Как тебя зовут?" value={s.name} onChange={(e) => s.set({ name: e.target.value })} />
      </Section>

      <Section title="Напоминания">
        <div className="flex items-center justify-between">
          <span>Напоминать о тренировках</span>
          <Switch checked={s.reminders.enabled} onCheckedChange={(v) => s.set({ reminders: { ...s.reminders, enabled: v } })} />
        </div>
        <label className="flex items-center justify-between">
          <span>Первое напоминание в</span>
          <select className="rounded-xl border-2 px-3 py-2" value={s.reminders.hour} onChange={(e) => s.set({ reminders: { ...s.reminders, hour: +e.target.value } })}>
            {Array.from({ length: 17 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>{h}:00</option>)}
          </select>
        </label>
        <p className="text-sm text-muted-foreground">Если не потренируешься — Пульс напомнит ещё через 2 и 4 часа. Уведомления работают, пока приложение открыто или установлено на главный экран.</p>
        <TapButton variant="soft" size="sm" onClick={async () => {
          if (typeof Notification === "undefined") { toast.error("Браузер не поддерживает уведомления"); return; }
          const p = await Notification.requestPermission();
          if (p !== "granted") { toast.error("Уведомления запрещены в браузере"); return; }
          await notify("Огонёк на связи 💪", "Теперь я буду напоминать о тренировках!");
        }}><Bell className="h-4 w-4" /> Разрешить уведомления</TapButton>
      </Section>

      <Section title="Звук и голос">
        <VoiceSection />
      </Section>

      <Section title="MuscleWiki">
        <input className={field} type="password" placeholder="mw_…" value={s.mwKey} onChange={(e) => s.set({ mwKey: e.target.value.trim() })} />
        <p className="text-sm text-muted-foreground">Ключ хранится только на этом устройстве. Используется для импорта упражнений с видео. Ответы сохраняются на устройстве, чтобы не тратить лимит.</p>
        <MwCacheInfo />
      </Section>

      <Section title="ИИ-помощник">
        <div className="flex rounded-2xl bg-muted p-1 text-sm font-semibold">
          {(["gemini", "openai"] as const).map((p) => (
            <button key={p} onClick={() => s.set({ ai: { ...s.ai, provider: p, model: p === "gemini" ? "gemini-2.5-flash" : "gpt-4o-mini" } })} className={`flex-1 rounded-xl py-2 transition-colors ${s.ai.provider === p ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              {p === "gemini" ? "Google Gemini" : "OpenAI-совместимый"}
            </button>
          ))}
        </div>
        <input className={field} type="password" placeholder="API-ключ" value={s.ai.apiKey} onChange={(e) => s.set({ ai: { ...s.ai, apiKey: e.target.value.trim() } })} />
        {s.ai.provider === "openai" && (
          <input className={field} placeholder="Base URL, напр. https://api.openai.com/v1" value={s.ai.baseUrl} onChange={(e) => s.set({ ai: { ...s.ai, baseUrl: e.target.value.trim() } })} />
        )}
        <input className={field} placeholder="Модель" value={s.ai.model} onChange={(e) => s.set({ ai: { ...s.ai, model: e.target.value.trim() } })} />
        <p className="text-sm text-muted-foreground">ИИ создаёт и улучшает упражнения и составляет тренировки. Ключ хранится только на устройстве.</p>
      </Section>

      <Section title="Данные">
        <DataSection />
        <p className="text-sm text-muted-foreground">Все данные хранятся на устройстве. Делай резервную копию, чтобы перенести прогресс.</p>
        <button className="text-sm font-semibold text-destructive" onClick={() => confirm("Удалить все данные безвозвратно?") && s.resetAll()}>Сбросить всё</button>
      </Section>
    </div>
  );
}
