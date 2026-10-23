import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TapButton } from "@/components/game/TapButton";

/** Exit with unsaved settings changes: save, discard, or stay. */
export function UnsavedDialog({
  open,
  onSave,
  onDiscard,
  onStay,
}: {
  open: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onStay: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onStay()}>
      <AlertDialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-3xl border-2 bg-card p-6">
        <AlertDialogTitle>Сохранить изменения в настройках?</AlertDialogTitle>
        <AlertDialogDescription>
          Ты менял(а) настройки, но не сохранил(а) их. Сохранить перед уходом или удалить?
        </AlertDialogDescription>
        <div className="mt-2 grid gap-2">
          <TapButton onClick={onSave}>Сохранить настройки</TapButton>
          <TapButton variant="danger" onClick={onDiscard}>
            Удалить изменения
          </TapButton>
          <AlertDialogCancel asChild>
            <TapButton variant="ghost">Остаться</TapButton>
          </AlertDialogCancel>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
