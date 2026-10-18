import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Trash2, Upload } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { evaluateBadges } from "@/lib/achievements";
import { level, streak } from "@/lib/game";
import { clearAvatarPhoto, setAvatarPhoto, useAvatarPhoto, useBlobUrl } from "@/lib/media";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Профиль · Пульс" },
      { name: "description", content: "Твой аватар, серия, достижения и цели." },
      { property: "og:title", content: "Профиль · Пульс" },
      { property: "og:description", content: "Серия, тренировки и достижения." },
    ],
  }),
  component: Profile,
});

const CAP =
  "text-xs font-bold uppercase tracking-wider text-muted-foreground";

function Profile() {
  const s = useApp();
  const lv = level(s.xp);
  const st = streak(s);
  const totalMin = Math.round(s.sessions.reduce((a, x) => a + x.durationSec, 0) / 60);
  const badges = evaluateBadges(s, new Date());
  const sinceText = s.since
    ? new Date(s.since + "T00:00:00").toLocaleDateString("ru", {
        month: "long",
        year: "numeric",
      })
    : null;
  const unlocked = badges.filter((b) => b.unlocked).length;
  const nextUnlocked = badges.filter((b) => !b.unlocked)[0];

  return (
    <div className="space-y-5">
      <section className="flex flex-col items-center gap-3 pt-2 text-center">
        <Avatar />
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{s.name || "Без имени"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {sinceText ? `В Пульсе с ${sinceText} · ` : ""}Ур. {lv.lvl}
          </p>
        </div>
      </section>

      <section aria-label="Краткая статистика" className="grid grid-cols-3 gap-3">
        {[
          { v: st, l: "дней серии", icon: "🔥" },
          { v: s.sessions.length, l: "тренировок", icon: "🏋️" },
          { v: totalMin, l: "минут", icon: "⏱" },
        ].map((x) => (
          <div key={x.l} className="card-soft p-4 text-center">
            <p className="text-xl font-extrabold tabular">
              {x.icon} {x.v}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{x.l}</p>
          </div>
        ))}
      </section>

      <Link to="/achievements" className="card-soft press block p-4">
        <div className="flex items-center justify-between">
          <span className={CAP}>Награды</span>
          <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground tabular">
            {unlocked} / {badges.length}
            <ChevronRight className="h-4 w-4" />
          </span>
        </div>
        <BadgeStrip badges={badges} next={nextUnlocked?.def.id} />
      </Link>

      <Link to="/progress" className="card-soft press flex items-center gap-4 p-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-2xl">
          🗺️
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">Полная статистика</p>
          <p className="text-sm text-muted-foreground">Карта нагрузки, советы и история</p>
        </div>
        <ChevronRight className="text-muted-foreground" />
      </Link>
    </div>
  );
}

/** Profile photo with a friendly fallback; tap opens a change/remove menu. */
function Avatar() {
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
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="Изменить фото профиля"
            className="press flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-primary-soft ring-4 ring-card"
          >
            {url ? (
              <img src={url} alt="Фото профиля" className="h-full w-full object-cover" />
            ) : (
              <Placeholder />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="min-w-48 rounded-2xl">
          <DropdownMenuItem className="min-h-[44px] text-[15px]" onSelect={() => file.current?.click()}>
            <Upload className="h-4 w-4" /> Загрузить фото
          </DropdownMenuItem>
          {blob && (
            <DropdownMenuItem
              className="min-h-[44px] text-[15px]"
              onSelect={() => {
                clearAvatarPhoto();
                toast("Фото убрано");
              }}
            >
              <Trash2 className="h-4 w-4" /> Убрать фото
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
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
    </div>
  );
}

/** Letter-on-color fallback while no photo is set. */
function Placeholder() {
  const name = useApp((s) => s.name);
  const ch = (name.trim()[0] ?? "💪").toUpperCase();
  return (
    <span aria-hidden className="flex h-full w-full items-center justify-center text-4xl font-extrabold text-primary-shade">
      {ch}
    </span>
  );
}

/** Horizontal ribbon of badge icons: unlocked in gold, rest muted. */
function BadgeStrip({
  badges,
  next,
}: {
  badges: ReturnType<typeof evaluateBadges>;
  next?: string | undefined;
}) {
  if (!badges.length) return null;
  return (
    <div className="mt-4 flex justify-center gap-2.5 overflow-x-auto py-1">
      {badges.map(({ def, unlocked: got }) => (
        <span
          key={def.id}
          title={`${def.title} — ${def.desc}`}
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl",
            got
              ? "bg-gold-soft shadow-sm"
              : def.id === next
                ? "bg-muted text-muted-foreground/70"
                : "bg-muted text-muted-foreground/40",
          )}
        >
          {def.icon}
        </span>
      ))}
    </div>
  );
}
