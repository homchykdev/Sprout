import { ActionCard } from "./ActionCard";
import { useApp } from "@/lib/store";
import type { ChatMessage } from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import { Mascot } from "@/components/game/Mascot";

/** One stored message bubble; assistant actions render as confirm cards. */
export function ChatMessages({
  sessionId,
  messages,
}: {
  sessionId: string;
  messages: ChatMessage[];
}) {
  const aiCount = useApp((s) => s.exercises.filter((e) => e.source === "ai").length);
  return (
    <div className="space-y-4 pb-2">
      {messages.map((m, i) => (
        <div
          key={m.id}
          className={cn(
            "animate-pop max-w-[85%]",
            m.role === "user" ? "ml-auto" : "mr-auto w-[92%] max-w-none",
          )}
          style={{ animationDelay: `${Math.min(i, 6) * 30}ms` }}
        >
          {m.attachments?.length ? (
            <p className="mb-1 text-right text-[11px] text-muted-foreground">
              {m.role === "user" ? "вложения: " : ""}
              {m.attachments.map((a) => a.name).join(", ")}
            </p>
          ) : null}
          <div
            className={cn(
              "rounded-3xl px-4 py-3 text-[15px] leading-relaxed",
              m.role === "user"
                ? "rounded-br-md bg-primary text-primary-foreground"
                : "rounded-bl-md card-soft border-0",
            )}
          >
            {m.text.split("\n").map((line, j) => (
              <p key={j} className={cn(line.startsWith("-") && "pl-3")}>
                {line}
              </p>
            ))}
          </div>
          {m.sources?.length ? (
            <div className="mt-2 space-y-1 px-2 text-xs">
              <p className="font-semibold text-muted-foreground">Источники</p>
              {m.sources.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block min-h-11 content-center break-all text-primary underline underline-offset-2"
                >
                  {source.title}
                </a>
              ))}
            </div>
          ) : null}
          {m.actions?.length ? (
            <div className="mt-2 space-y-2">
              {m.actions.map((a, idx) => (
                <ActionCard key={a.id} sessionId={sessionId} message={m} action={a} index={idx} />
              ))}
            </div>
          ) : null}
        </div>
      ))}
      {messages.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Mascot mood="happy" size={110} />
          <p className="max-w-xs text-sm text-muted-foreground">
            Твой ИИ-тренер. Спроси что угодно про тренировки — от «составь план на неделю» до
            «разбери технику приседа».
            {aiCount > 0 ? ` В библиотеке уже ${aiCount} ИИ-упражнений.` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
