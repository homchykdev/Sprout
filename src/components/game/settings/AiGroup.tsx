import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { TapButton } from "@/components/game/TapButton";
import { maskKey } from "@/lib/ai-keys";
import { checkAiKeys } from "@/lib/clients";
import { cn } from "@/lib/utils";
import { SectionCard, field } from "./SectionCard";
import { useSettingsDraft } from "./draft-context";
import { ApiCheck } from "./ApiCheck";

/** Multiple AI keys with automatic failover: the first key with remaining quota is used. */
function AiKeys() {
  const { draft, updateAi } = useSettingsDraft();
  const ai = draft.ai;
  const [draftKey, setDraftKey] = useState("");
  const add = () => {
    const k = draftKey.trim();
    if (k.length < 4 || ai.keys.includes(k)) return;
    updateAi({ keys: [...ai.keys, k] });
    setDraftKey("");
    // Keys stay in the store only after save; the toast describes the draft.
    toast.success("Ключ добавлен (ещё не сохранён)");
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
            onClick={() => updateAi({ keys: ai.keys.filter((_, j) => j !== i) })}
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
          value={draftKey}
          onChange={(e) => setDraftKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <TapButton size="sm" variant="soft" onClick={add} disabled={draftKey.trim().length < 4}>
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

export function AiGroup() {
  const { draft, updateAi, dirty } = useSettingsDraft();
  const ai = draft.ai;
  return (
    <SectionCard
      title="ИИ-помощник"
      hint="ИИ создаёт и улучшает упражнения и составляет тренировки. Ключи хранятся только на устройстве."
    >
      <div
        className="flex rounded-2xl bg-muted p-1 text-sm font-semibold"
        role="radiogroup"
        aria-label="Провайдер ИИ"
      >
        {(["gemini", "openai"] as const).map((p) => (
          <button
            key={p}
            role="radio"
            aria-checked={ai.provider === p}
            onClick={() =>
              updateAi({
                provider: p,
                model: p === "gemini" ? "gemini-2.5-flash" : "gpt-4o-mini",
              })
            }
            className={cn(
              "min-h-[44px] flex-1 rounded-xl py-2 transition-colors",
              ai.provider === p ? "bg-card shadow-sm" : "text-muted-foreground",
            )}
          >
            {p === "gemini" ? "Google Gemini" : "OpenAI-совместимый"}
          </button>
        ))}
      </div>
      <AiKeys />
      {ai.provider === "openai" && (
        <input
          className={field}
          placeholder="Base URL, напр. https://api.openai.com/v1"
          value={ai.baseUrl}
          onChange={(e) => updateAi({ baseUrl: e.target.value.trim() })}
        />
      )}
      <input
        className={field}
        placeholder="Модель"
        value={ai.model}
        onChange={(e) => updateAi({ model: e.target.value.trim() })}
        aria-label="Модель ИИ"
      />
      <ApiCheck
        label="Проверить ключи"
        check={() => checkAiKeys(ai)}
        disabled={ai.keys.length === 0}
      />
      {dirty && (
        <p className="text-xs text-muted-foreground">
          Проверка идёт по черновику — нажми «Сохранить», чтобы ключи начали работать.
        </p>
      )}
    </SectionCard>
  );
}
