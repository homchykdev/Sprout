import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Plus } from "lucide-react";
import { ApiCheck } from "@/components/game/settings/ApiCheck";
import { TapButton } from "@/components/game/TapButton";
import { maskKey } from "@/lib/ai-keys";
import { checkAiKeys } from "@/lib/clients";
import { cn } from "@/lib/utils";
import { field } from "@/components/game/settings/SectionCard";
import type { StepProps } from "./types";

const GEMINI_URL = "https://aistudio.google.com/apikey";

/** Step 4: own AI provider key, with a short "how to get one" guide. */
export function StepAiKey({ draft, update }: StepProps) {
  const ai = draft.ai;
  const [keyDraft, setKeyDraft] = useState(draft.keyDraft);
  const [guideOpen, setGuideOpen] = useState(false);

  const add = () => {
    const k = keyDraft.trim();
    if (k.length < 4 || ai.keys.includes(k)) return;
    update((d) => ({ ...d, ai: { ...d.ai, keys: [...d.ai.keys, k] } }));
    setKeyDraft("");
  };

  const setAi = (p: Partial<typeof ai>) => update((d) => ({ ...d, ai: { ...d.ai, ...p } }));

  return (
    <div className="flex flex-1 flex-col gap-3 py-6">
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
              setAi({ provider: p, model: p === "gemini" ? "gemini-2.5-flash" : "gpt-4o-mini" })
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
            onClick={() => setAi({ keys: ai.keys.filter((_, j) => j !== i) })}
          >
            ×
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          className={field}
          type="password"
          autoComplete="off"
          placeholder={ai.keys.length ? "Ещё один ключ (запасной)" : "API-ключ"}
          value={keyDraft}
          onChange={(e) => {
            setKeyDraft(e.target.value);
            update((d) => ({ ...d, keyDraft: e.target.value }));
          }}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <TapButton size="sm" variant="soft" onClick={add} disabled={keyDraft.trim().length < 4}>
          <Plus className="h-4 w-4" />
        </TapButton>
      </div>

      {ai.provider === "openai" && (
        <input
          className={field}
          placeholder="Base URL, напр. https://api.openai.com/v1"
          value={ai.baseUrl}
          onChange={(e) => setAi({ baseUrl: e.target.value.trim() })}
          aria-label="Base URL"
        />
      )}
      <input
        className={field}
        placeholder="Модель"
        value={ai.model}
        onChange={(e) => setAi({ model: e.target.value.trim() })}
        aria-label="Модель ИИ"
      />

      <ApiCheck
        label="Проверить ключ"
        check={() => checkAiKeys(ai)}
        disabled={ai.keys.length === 0}
      />

      {/* collapsible how-to guide */}
      <div className="rounded-2xl border-2 border-border">
        <button
          className="flex min-h-[44px] w-full items-center justify-between px-4 py-2.5 text-sm font-semibold"
          aria-expanded={guideOpen}
          onClick={() => setGuideOpen((v) => !v)}
        >
          Как получить ключ?
          {guideOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {guideOpen && (
          <div className="animate-rise space-y-3 px-4 pb-4 text-sm text-muted-foreground">
            {ai.provider === "gemini" ? (
              <>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>
                    Открой{" "}
                    <a
                      className="inline-flex items-center gap-1 text-primary-shade underline"
                      href={GEMINI_URL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      aistudio.google.com/apikey <ExternalLink className="inline h-3 w-3" />
                    </a>
                  </li>
                  <li>Войди в аккаунт Google и нажми «Create API key».</li>
                  <li>Скопируй ключ и вставь его в поле выше.</li>
                </ol>
                <p>Бесплатного тарифа хватает с запасом для упражнений и планов.</p>
              </>
            ) : (
              <>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Создай API-ключ в кабинете твоего провайдера (или локального сервера).</li>
                  <li>Укажи Base URL — адрес, куда отправлять запросы.</li>
                  <li>Укажи модель — название модели у провайдера.</li>
                </ol>
                <p>Подойдёт и OpenAI, и любой совместимый сервис (OpenRouter, Ollama и др.).</p>
              </>
            )}
            <p className="text-xs">
              Ключ хранится только на устройстве и передаётся напрямую провайдеру через временный
              прокси приложения.
            </p>
          </div>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Без ключа ИИ-функции недоступны, всё остальное работает. Можно пропустить.
      </p>
    </div>
  );
}
