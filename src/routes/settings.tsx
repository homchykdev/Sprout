import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { SettingsDraftProvider } from "@/components/game/settings/SettingsDraftProvider";
import { useSettingsDraft } from "@/components/game/settings/draft-context";
import { FloatingSaveBar } from "@/components/game/settings/FloatingSaveBar";
import { UnsavedDialog } from "@/components/game/settings/UnsavedDialog";
import { ProfileGroup } from "@/components/game/settings/ProfileGroup";
import { PlanGroup } from "@/components/game/settings/PlanGroup";
import { NotificationsGroup } from "@/components/game/settings/NotificationsGroup";
import { SoundGroup } from "@/components/game/settings/SoundGroup";
import { AiGroup } from "@/components/game/settings/AiGroup";
import { VideoGroup } from "@/components/game/settings/VideoGroup";
import { DataGroup } from "@/components/game/settings/DataGroup";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Настройки · Пульс" },
      {
        name: "description",
        content: "Профиль, напоминания, звук, ключи ИИ, видео и резервные копии.",
      },
      { property: "og:title", content: "Настройки · Пульс" },
      { property: "og:description", content: "Все настройки в одном меню." },
    ],
  }),
  component: SettingsScreen,
});

function SettingsScreen() {
  return (
    <SettingsDraftProvider>
      <SettingsBody />
    </SettingsDraftProvider>
  );
}

function SettingsBody() {
  const { dirty, save, discard } = useSettingsDraft();
  const blocker = useBlocker({
    shouldBlockFn: () => true,
    withResolver: true,
    disabled: !dirty,
  });
  const blocked = blocker.status === "blocked";

  const leave = (mode: "save" | "discard") => {
    if (mode === "save") save();
    else discard();
    blocker.proceed?.();
  };

  return (
    <div className="pb-20">
      <div className="flex items-center gap-2 pt-2">
        <Link to="/" className="press -ml-2 rounded-full p-2 hover:bg-muted" aria-label="Назад">
          <ArrowLeft />
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight">Настройки</h1>
      </div>
      <div className="mt-4 space-y-4">
        <ProfileGroup />
        <PlanGroup />
        <NotificationsGroup />
        <SoundGroup />
        <AiGroup />
        <VideoGroup />
        <DataGroup />
      </div>
      <FloatingSaveBar />
      <UnsavedDialog
        open={blocked}
        onSave={() => leave("save")}
        onDiscard={() => leave("discard")}
        onStay={() => blocker.reset?.()}
      />
    </div>
  );
}
