import { useRef } from "react";
import { toast } from "sonner";
import { Camera, Trash2 } from "lucide-react";
import { TapButton } from "@/components/game/TapButton";
import { clearAvatarPhoto, setAvatarPhoto, useAvatarPhoto, useBlobUrl } from "@/lib/media";
import type { StepProps } from "./types";

/** Step 3: profile photo. Stored on-device in IndexedDB, like in «Профиль». */
export function StepAvatar({ draft, update }: StepProps) {
  const blob = useAvatarPhoto();
  const url = useBlobUrl(blob);
  const file = useRef<HTMLInputElement>(null);

  const pick = (fs: FileList | null) => {
    const f = fs?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Нужно изображение — JPG, PNG или WebP");
      return;
    }
    setAvatarPhoto(f)
      .then(() => toast.success("Фото профиля обновлено"))
      .catch(() => toast.error("Не удалось сохранить фото"));
  };

  return (
    <div className="flex flex-1 flex-col items-center gap-4 py-6 text-center">
      <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full bg-primary-soft ring-4 ring-card">
        {url ? (
          <img src={url} alt="Фото профиля" className="h-full w-full object-cover" />
        ) : (
          <span
            aria-hidden
            className="flex h-full w-full items-center justify-center text-4xl font-extrabold text-primary-shade"
          >
            {(draft.name.trim()[0] ?? "💪").toUpperCase()}
          </span>
        )}
      </div>
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
      <TapButton
        variant="soft"
        size="sm"
        className="min-h-[44px]"
        onClick={() => file.current?.click()}
      >
        <Camera className="h-4 w-4" /> Загрузить фото
      </TapButton>
      {blob && (
        <TapButton
          variant="ghost"
          size="sm"
          onClick={() => {
            clearAvatarPhoto();
            toast("Фото убрано");
          }}
        >
          <Trash2 className="h-4 w-4" /> Убрать фото
        </TapButton>
      )}
      <p className="text-sm text-muted-foreground">
        Фото хранится только на устройстве. Можно пропустить, будет показана первая буква имени.
      </p>
    </div>
  );
}
