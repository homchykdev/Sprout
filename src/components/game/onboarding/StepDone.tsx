import { Mascot } from "@/components/game/Mascot";
import { Settings } from "lucide-react";

/** Step 5: wrap-up — everything can be changed later in Settings. */
export function StepDone(_props: unknown) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-6 text-center">
      <Mascot mood="fire" size={140} />
      <p className="max-w-sm text-[15px] text-muted-foreground">
        Настройка завершена. Имя, аватар и ключи ИИ можно изменить в любое время в разделе
        «Настройки» — там же резервное копирование.
      </p>
      <p className="flex items-center gap-1.5 text-sm font-semibold text-primary-shade">
        <Settings className="h-4 w-4" /> Настройки · иконка шестерёнки в шапке
      </p>
    </div>
  );
}
