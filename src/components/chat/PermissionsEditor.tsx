import {
  DOMAIN_LABELS,
  type ChatDomain,
  type ChatPermissions,
  type PermissionMode,
} from "@/lib/chat/types";
import { useChat } from "@/lib/chat/store";
import { cn } from "@/lib/utils";
import { ShieldQuestion } from "lucide-react";

const MODES: { value: PermissionMode; label: string }[] = [
  { value: "always", label: "Всегда" },
  { value: "ask", label: "Спрашивать" },
  { value: "off", label: "Нельзя" },
];

const HINTS: Record<PermissionMode, string> = {
  always: "ИИ применяет изменения молча",
  ask: "ИИ показывает карточку с подтверждением",
  off: "ИИ вообще не предлагает эти изменения",
};

const DOMAIN_HINTS: Record<ChatDomain, string> = {
  exercises: "создание и правка упражнений",
  workouts: "создание тренировок",
  plan: "шаги цикла плана (тренировка/отдых)",
};

/** 3 домена × 3 режима; сам хранит выбор в persist-сторе чата. */
export function PermissionsEditor() {
  const permissions = useChat((s) => s.permissions);
  const setPermissions = useChat((s) => s.setPermissions);

  const set = (domain: ChatDomain, mode: PermissionMode) =>
    setPermissions({ ...permissions, [domain]: mode });

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldQuestion className="h-4 w-4 shrink-0" aria-hidden />
        Что ИИ разрешено менять в твоих данных
      </p>
      {(Object.keys(DOMAIN_LABELS) as ChatDomain[]).map((domain) => (
        <div
          key={domain}
          className="rounded-2xl border-2 bg-card p-3"
          role="radiogroup"
          aria-label={DOMAIN_LABELS[domain]}
        >
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <span className="font-semibold">{DOMAIN_LABELS[domain]}</span>
            <span className="truncate text-[11px] text-muted-foreground">
              {DOMAIN_HINTS[domain]}
            </span>
          </div>
          <div className="mt-2 flex gap-2">
            {MODES.map((m) => {
              const active = permissions[domain] === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={HINTS[m.value]}
                  onClick={() => set(domain, m.value)}
                  className={cn(
                    "press min-h-[44px] flex-1 rounded-xl border-2 px-2 text-xs font-bold transition-colors",
                    active
                      ? "border-primary bg-primary-soft text-primary-shade"
                      : "border-border bg-background text-muted-foreground",
                  )}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
