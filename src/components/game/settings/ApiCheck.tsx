import { CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { TapButton } from "@/components/game/TapButton";
import { cn } from "@/lib/utils";

/** "Проверить" button for API keys: cheap request, inline ✓/✗ status. */
export function ApiCheck({
  label,
  check,
  disabled,
}: {
  label: string;
  check: () => Promise<string>;
  disabled?: boolean;
}) {
  const [st, setSt] = useState<"idle" | "busy" | "ok" | "fail">("idle");
  const [msg, setMsg] = useState("");
  const run = async () => {
    setSt("busy");
    setMsg("");
    try {
      const line = await check();
      setSt("ok");
      setMsg(line);
    } catch (e) {
      setSt("fail");
      setMsg(e instanceof Error ? e.message : "Не удалось проверить");
    }
  };
  return (
    <div>
      <TapButton
        variant="soft"
        size="sm"
        className="min-h-[44px] w-full"
        disabled={disabled || st === "busy"}
        onClick={run}
      >
        {st === "busy" ? "Проверяю…" : label}
      </TapButton>
      {(st === "ok" || st === "fail") && (
        <p
          role="status"
          className={cn(
            "mt-1.5 flex items-center gap-1.5 text-sm font-semibold",
            st === "ok" ? "text-primary-shade" : "text-destructive",
          )}
        >
          {st === "ok" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0" />
          )}
          {msg}
        </p>
      )}
    </div>
  );
}
