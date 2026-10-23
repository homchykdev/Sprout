import { Check, Save } from "lucide-react";
import { TapButton } from "@/components/game/TapButton";
import { cn } from "@/lib/utils";
import { useSettingsDraft } from "./draft-context";

const SAVE_BAR_OFFSET = "bottom-[calc(env(safe-area-inset-bottom)+88px)]";

/** Pinned save bar above the bottom navigation: always visible, disabled once saved. */
export function FloatingSaveBar() {
  const { dirty, save } = useSettingsDraft();
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 z-40 flex justify-center",
        SAVE_BAR_OFFSET,
      )}
    >
      <div className="pointer-events-auto w-full max-w-xl px-5">
        <TapButton
          className="h-14 w-full shadow-lg"
          size="lg"
          disabled={!dirty}
          onClick={save}
          aria-disabled={!dirty}
        >
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
    </div>
  );
}
