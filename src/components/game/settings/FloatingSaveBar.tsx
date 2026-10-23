import { Check, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { TapButton } from "@/components/game/TapButton";
import { cn } from "@/lib/utils";
import { useSettingsDraft } from "./draft-context";

/**
 * Pinned save bar above the bottom navigation: always visible, disabled once saved.
 * Portaled to body: the animated <main> becomes a containing block for fixed children.
 */
export function FloatingSaveBar() {
  const { dirty, save } = useSettingsDraft();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 z-40 flex justify-center",
        "bottom-[calc(env(safe-area-inset-bottom)+88px)]",
      )}
    >
      <div className="pointer-events-auto w-full max-w-xl px-5">
        <TapButton className="h-14 w-full shadow-lg" size="lg" disabled={!dirty} onClick={save}>
          {dirty ? (
            <>
              <Save className="h-5 w-5" /> Сохранить настройки
            </>
          ) : (
            <>
              <Check className="h-5 w-5" /> Сохранено
            </>
          )}
        </TapButton>
      </div>
    </div>,
    document.body,
  );
}
