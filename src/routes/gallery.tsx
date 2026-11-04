import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Camera,
  Check,
  Columns2,
  Download,
  ImagePlus,
  Link2,
  MoreVertical,
  Pencil,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { LinkMedia } from "@/components/game/LinkMedia";
import { PhotoCompare } from "@/components/game/PhotoCompare";
import { PhotoEditDialog } from "@/components/game/PhotoEditDialog";
import { PhotoGroupDialog } from "@/components/game/PhotoGroupDialog";
import { PhotoLightbox } from "@/components/game/PhotoLightbox";
import { PhotoTile } from "@/components/game/PhotoTile";
import { PhotoTimeline, type Group } from "@/components/game/PhotoTimeline";
import { consumeLongPress, markLongPress, useLongPress } from "@/hooks/use-long-press";
import { parseClips, parseLink } from "@/lib/embed";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Mascot } from "@/components/game/Mascot";
import { TapButton } from "@/components/game/TapButton";
import {
  addFiles,
  addLink,
  exportMedia,
  groupItems,
  importMedia,
  removeMedia,
  ungroup,
  useBlobUrl,
  useMedia,
  type Album,
  type MediaItem,
} from "@/lib/media";
import { STRAIN_LABEL, VIEW_LABEL, type PoseStrain, type PoseView } from "@/lib/pose";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/gallery")({
  head: () => ({
    meta: [
      { title: "Фото прогресса и цели · Пульс" },
      {
        name: "description",
        content: "Личная хронология фото и видео прогресса и доска целей фигуры.",
      },
      { property: "og:title", content: "Фото прогресса и цели · Пульс" },
      {
        property: "og:description",
        content: "Смотри, как меняется тело, и держи цель перед глазами.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Gallery,
});

function Gallery() {
  const [album, setAlbum] = useState<Album>("progress");
  const [compareMode, setCompareMode] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 pt-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Фото</h1>
        <div className="flex gap-1">
          <Link
            to="/capture"
            aria-label="Снять фото прогресса"
            className="press flex h-11 w-11 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-primary-soft"
          >
            <Camera className="h-5 w-5" />
          </Link>
          {album === "progress" && (
            <button
              type="button"
              aria-label={compareMode ? "Выйти из сравнения" : "Сравнить фото"}
              aria-pressed={compareMode}
              onClick={() => setCompareMode((v) => !v)}
              className={cn(
                "press flex h-11 w-11 items-center justify-center rounded-full transition-colors",
                compareMode
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground hover:bg-primary-soft",
              )}
            >
              <Columns2 className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
      <div
        className="flex rounded-full bg-muted p-1 text-sm font-semibold"
        role="tablist"
        aria-label="Альбомы"
      >
        {(
          [
            ["progress", "Мой прогресс"],
            ["goal", "Цели фигуры"],
          ] as const
        ).map(([id, l]) => (
          <button
            key={id}
            role="tab"
            aria-selected={album === id}
            onClick={() => setAlbum(id)}
            className={cn(
              "min-h-[44px] flex-1 rounded-full transition-colors",
              album === id ? "bg-card shadow-sm" : "text-muted-foreground",
            )}
          >
            {l}
          </button>
        ))}
      </div>
      <AlbumView
        album={album}
        compareMode={album === "progress" && compareMode}
        onExitCompare={() => setCompareMode(false)}
      />
    </div>
  );
}

export function AlbumView({
  album,
  compareMode = false,
  onExitCompare,
}: {
  album: Album;
  compareMode?: boolean;
  onExitCompare?: () => void;
}) {
  const items = useMedia(album);
  const ffmpegKey = useApp((s) => s.ffmpegKey);
  const ffmpegOptions = useApp((s) => s.ffmpegOptions);
  const ffmpegOut = useApp((s) => s.ffmpegOut);
  const [light, setLight] = useState<{ items: MediaItem[]; index: number } | null>(null);
  const [editItem, setEditItem] = useState<MediaItem | null>(null);
  const [ungroupId, setUngroupId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [groupOpen, setGroupOpen] = useState<string | null>(null);
  const [compare, setCompare] = useState<MediaItem[]>([]);
  const [compareSel, setCompareSel] = useState<string[]>([]);
  const [pickView, setPickView] = useState<PoseView | "all">("all");
  const [pickStrain, setPickStrain] = useState<PoseStrain | "all">("all");
  const [delOpen, setDelOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const arch = useRef<HTMLInputElement>(null);

  const allIds = (items ?? []).map((x) => x.id);
  const shots = (items ?? []).filter((m) => m.kind === "image" && !!m.blob);
  const hasPose = shots.some((m) => m.pose);
  const hasStrain = shots.some((m) => m.strain);
  const picked = shots.filter(
    (m) =>
      (pickView === "all" || m.pose === pickView) &&
      (pickStrain === "all" || m.strain === pickStrain),
  );
  const selectedShots = shots.filter((m) => sel.includes(m.id)).length;

  useEffect(() => {
    if (compareMode) {
      setSelecting(false);
      setSel([]);
      setCompareSel([]);
    }
  }, [compareMode]);

  const upload = async (fs: FileList | null) => {
    if (!fs?.length) return;
    setBusy(true);
    try {
      const { added, converted, skipped, tooHeavy } = await addFiles(
        [...fs],
        album,
        ffmpegKey ? { ffmpegKey, ffmpegOptions, ffmpegOut } : undefined,
      );
      if (added.length > 1) {
        // Several angles at once = one group (front/side/back).
        await groupItems(added);
        toast.success(
          converted.length
            ? `Группа из ${added.length} создана · видео перекодировано ✓`
            : `Группа из ${added.length} фото создана`,
        );
      } else if (added.length === 1) {
        toast.success(converted.length ? "Видео перекодировано ✓" : "Добавлено");
      }
      if (skipped.length)
        toast.error(
          skipped.length === 1
            ? "Файл не принят — нужны JPG, PNG, GIF, HEIC или MP4"
            : `Не принято файлов: ${skipped.length} — нужны JPG, PNG, GIF, HEIC или MP4`,
        );
      if (tooHeavy.length)
        toast.error("Видео должно быть короче 30 сек и легче 50 МБ — обрежь его и попробуй снова");
      if (!added.length && !skipped.length && !tooHeavy.length)
        toast.error("Не удалось сохранить — возможно, мало места");
    } catch {
      toast.error("Не удалось сохранить — возможно, мало места");
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    const b = await exportMedia(album);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = `pulse-${album === "progress" ? "progress" : "goals"}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  /** Long-press on a card: enter multi-select with this item checked. */
  const enterSelect = (ids: string[]) => {
    if (!selecting) setSelecting(true);
    setSel((prev) => [...new Set([...prev, ...ids])]);
  };
  const exitSelect = () => {
    setSelecting(false);
    setSel([]);
  };
  const toggle = (id: string) =>
    setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  const toggleGroup = (g: Group) => {
    const ids = g.items.map((x) => x.id);
    const all = ids.every((id) => sel.includes(id));
    setSel(all ? sel.filter((id) => !ids.includes(id)) : [...new Set([...sel, ...ids])]);
  };
  /** Single tap: toggle in select mode (ignoring the click after a hold), else full-screen gallery. */
  const openAlbumAt = (m: MediaItem) => {
    const list = items ?? [];
    const i = list.findIndex((x) => x.id === m.id);
    if (i >= 0) setLight({ items: list, index: i });
  };
  const openGroupAt = (g: Group, from?: MediaItem) => {
    const list = [...g.items].sort((a, b) => a.createdAt - b.createdAt);
    const i = from ? list.findIndex((x) => x.id === from.id) : 0;
    setLight({ items: list, index: Math.max(0, i) });
  };
  const tapItem = (m: MediaItem) => {
    if (consumeLongPress()) return;
    if (selecting) toggle(m.id);
    else openAlbumAt(m);
  };
  const tapGroup = (g: Group) => {
    if (consumeLongPress()) return;
    if (selecting) toggleGroup(g);
    else openGroupAt(g, g.cover);
  };
  const makeGroup = async () => {
    if (sel.length < 2) return;
    await groupItems(sel);
    toast.success(`Группа из ${sel.length} фото создана`);
    exitSelect();
  };
  const startCompare = (ids: string[] = sel) => {
    const list = (items ?? [])
      .filter((x) => ids.includes(x.id) && x.kind === "image" && !!x.blob)
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
    if (list.length < 2) return;
    setCompare(list);
    setCompareSel([]);
    exitSelect();
  };
  const toggleCompare = (id: string) =>
    setCompareSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const allPickedSelected = picked.length > 0 && picked.every((m) => compareSel.includes(m.id));
  const selectPickedAll = () =>
    setCompareSel((prev) => {
      const ids = picked.map((m) => m.id);
      return allPickedSelected
        ? prev.filter((id) => !ids.includes(id))
        : [...new Set([...prev, ...ids])];
    });
  const exitCompareMode = () => {
    setCompareSel([]);
    setPickView("all");
    setPickStrain("all");
    onExitCompare?.();
  };
  const selectAll = () => setSel(sel.length === allIds.length ? [] : allIds);
  const doDelete = async () => {
    for (const id of sel) await removeMedia(id);
    toast.success(sel.length === 1 ? "Удалено" : `Удалено: ${sel.length}`);
    setDelOpen(false);
    exitSelect();
  };

  return (
    <div className="space-y-4">
      {!compareMode && (
        <div className="flex gap-2">
          <TapButton className="flex-1" disabled={busy} onClick={() => file.current?.click()}>
            <ImagePlus className="h-4 w-4" /> {busy ? "Сохраняю…" : "Загрузить"}
          </TapButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <TapButton variant="soft" size="icon" aria-label="Ещё действия">
                <MoreVertical className="h-5 w-5" />
              </TapButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56 rounded-2xl">
              <DropdownMenuItem
                className="min-h-[44px] text-[15px]"
                onSelect={() => setLinkOpen(true)}
              >
                <Link2 className="h-4 w-4" /> Добавить по ссылке
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-[44px] text-[15px]" onSelect={() => void save()}>
                <Download className="h-4 w-4" /> Сохранить архив
              </DropdownMenuItem>
              <DropdownMenuItem
                className="min-h-[44px] text-[15px]"
                onSelect={() => arch.current?.click()}
              >
                <Upload className="h-4 w-4" /> Загрузить архив
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      {selecting && !compareMode && (
        <div className="card-soft animate-pop space-y-2.5 p-3">
          <div className="flex items-center gap-2">
            <span className="flex-1 text-sm font-semibold tabular">Выбрано: {sel.length}</span>
            <TapButton variant="ghost" size="icon" aria-label="Закрыть выбор" onClick={exitSelect}>
              <X className="h-5 w-5" />
            </TapButton>
          </div>
          <div className="flex flex-wrap gap-2">
            <TapButton size="sm" variant="soft" className="min-h-[44px]" onClick={selectAll}>
              {sel.length === allIds.length ? "Снять выбор" : "Выбрать всё"}
            </TapButton>
            <TapButton
              size="sm"
              className="min-h-[44px]"
              disabled={sel.length < 2}
              onClick={makeGroup}
            >
              В группу
            </TapButton>
            <TapButton
              size="sm"
              variant="soft"
              className="min-h-[44px]"
              disabled={selectedShots < 2}
              onClick={() => startCompare()}
            >
              Сравнить
            </TapButton>
            <TapButton
              size="sm"
              variant="danger"
              className="min-h-[44px]"
              disabled={!sel.length}
              onClick={() => setDelOpen(true)}
            >
              <Trash2 className="h-4 w-4" /> Удалить
            </TapButton>
          </div>
          {sel.length >= 1 && selectedShots < 2 && (
            <p className="text-xs text-muted-foreground">
              Выбери минимум два фото, чтобы сравнить «до / после».
            </p>
          )}
        </div>
      )}
      <input
        ref={file}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          upload(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={arch}
        type="file"
        accept="application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            const n = await importMedia(f);
            toast.success(`Загружено: ${n}`);
          } catch {
            toast.error("Это не архив фото Пульса");
          }
        }}
      />

      {compareMode ? (
        <div className="space-y-3">
          <div className="card-soft animate-pop space-y-2.5 p-3">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-sm font-semibold tabular">
                Выбрано: {compareSel.length}
              </span>
              <TapButton
                variant="ghost"
                size="icon"
                aria-label="Закрыть сравнение"
                onClick={exitCompareMode}
              >
                <X className="h-5 w-5" />
              </TapButton>
            </div>
            <p className="text-xs text-muted-foreground">
              2 фото — шторка «было / стало», 3 и больше — быстрое перелистывание.
            </p>
            <div className="flex flex-wrap gap-2">
              <TapButton
                size="sm"
                className="min-h-[44px]"
                disabled={compareSel.length < 2}
                onClick={() => startCompare(compareSel)}
              >
                <Columns2 className="h-4 w-4" /> Сравнить
              </TapButton>
              <TapButton
                size="sm"
                variant="soft"
                className="min-h-[44px]"
                disabled={!picked.length}
                onClick={selectPickedAll}
              >
                {allPickedSelected ? "Снять выбор" : "Выбрать всё"}
              </TapButton>
            </div>
          </div>

          {hasPose && (
            <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Фильтр по ракурсу">
              <FilterChip active={pickView === "all"} onClick={() => setPickView("all")}>
                Все ракурсы
              </FilterChip>
              {(["front", "side", "back"] as const).map((v) => (
                <FilterChip key={v} active={pickView === v} onClick={() => setPickView(v)}>
                  {VIEW_LABEL[v]}
                </FilterChip>
              ))}
            </div>
          )}
          {hasStrain && (
            <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Фильтр по напряжению">
              <FilterChip active={pickStrain === "all"} onClick={() => setPickStrain("all")}>
                Любая поза
              </FilterChip>
              {(["relaxed", "flexed"] as const).map((v) => (
                <FilterChip key={v} active={pickStrain === v} onClick={() => setPickStrain(v)}>
                  {STRAIN_LABEL[v]}
                </FilterChip>
              ))}
            </div>
          )}

          {picked.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {picked.map((m) => (
                <ComparePick
                  key={m.id}
                  m={m}
                  selected={compareSel.includes(m.id)}
                  onToggle={() => toggleCompare(m.id)}
                />
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Нет фото под выбранный фильтр. Сбрось ракурс или сними новый кадр.
            </p>
          )}
        </div>
      ) : items === null ? (
        <div className="grid grid-cols-2 gap-3" aria-label="Загрузка фото">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-[3/4] w-full rounded-2xl" />
          ))}
        </div>
      ) : !items.length ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Mascot mood="cheer" size={90} />
          <p className="font-semibold">
            {album === "progress"
              ? "Сделай первое фото — через месяц скажешь спасибо"
              : "Добавь фото фигуры мечты"}
          </p>
          <p className="text-sm text-muted-foreground">Всё хранится только на этом устройстве.</p>
          {album === "progress" && (
            <Link
              to="/capture"
              className="press mt-2 inline-flex h-12 items-center gap-2 rounded-2xl bg-primary px-5 text-[15px] font-semibold text-primary-foreground shadow-[0_4px_0_var(--primary-shade)]"
            >
              <Camera className="h-4 w-4" /> Снять в позе
            </Link>
          )}
        </div>
      ) : album === "progress" ? (
        <>
          <PhotoTimeline
            items={items}
            selectMode={selecting}
            selected={sel}
            onToggle={toggle}
            onToggleGroup={toggleGroup}
            onOpen={tapItem}
            onOpenGroup={tapGroup}
            onHoldItem={(m) => enterSelect([m.id])}
            onHoldGroup={(g) => enterSelect(g.items.map((x) => x.id))}
            onEdit={setEditItem}
            onDelete={(m) => {
              setSel([m.id]);
              setDelOpen(true);
            }}
            onCover={setGroupOpen}
            onUngroup={setUngroupId}
            onDeleteGroup={(g) => {
              setSel(g.items.map((x) => x.id));
              setDelOpen(true);
            }}
          />
          {!selecting && <HoldHint />}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {items.map((m) => (
              <GoalCell
                key={m.id}
                m={m}
                selectMode={selecting}
                selected={sel.includes(m.id)}
                onTap={() => tapItem(m)}
                onHold={() => enterSelect([m.id])}
                onEdit={() => setEditItem(m)}
                onDelete={() => {
                  setSel([m.id]);
                  setDelOpen(true);
                }}
              />
            ))}
          </div>
          {!selecting && <HoldHint />}
        </>
      )}
      {light && (
        <PhotoLightbox
          items={light.items}
          index={Math.min(light.index, light.items.length - 1)}
          onIndex={(i) => setLight({ items: light.items, index: i })}
          onClose={() => setLight(null)}
        />
      )}
      <PhotoEditDialog item={editItem} onClose={() => setEditItem(null)} />
      <PhotoGroupDialog
        groupId={groupOpen}
        items={items ?? []}
        onClose={() => setGroupOpen(null)}
        onView={(m) => {
          const g = (items ?? []).find((x) => x.id === m.id)?.groupId;
          const list = (items ?? [])
            .filter((x) => x.groupId === g)
            .sort((a, b) => a.createdAt - b.createdAt);
          const i = list.findIndex((x) => x.id === m.id);
          if (list.length) {
            setGroupOpen(null);
            setLight({ items: list, index: Math.max(0, i) });
          }
        }}
      />
      <PhotoCompare items={compare} onClose={() => setCompare([])} />
      <LinkDialog open={linkOpen} album={album} onClose={() => setLinkOpen(false)} />

      <AlertDialog open={ungroupId != null} onOpenChange={(o) => !o && setUngroupId(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Разгруппировать?</AlertDialogTitle>
            <AlertDialogDescription>
              Фото останутся в ленте, группа распадётся.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px]"
              onClick={async () => {
                if (ungroupId) await ungroup(ungroupId);
                setUngroupId(null);
                toast.success("Группа распущена");
              }}
            >
              Разгруппировать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Удалить {sel.length === 1 ? "фото" : `${sel.length} фото`} навсегда?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Файлы пропадут с этого устройства без возможности восстановления. Группы, в которых
              они были, распадутся.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void doDelete()}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const fmtShort = (d: string) =>
  new Date(d + "T00:00").toLocaleDateString("ru", { day: "numeric", month: "short" });

/** Compare-mode cell: tap toggles the photo. */
function ComparePick({
  m,
  selected,
  onToggle,
}: {
  m: MediaItem;
  selected: boolean;
  onToggle: () => void;
}) {
  const url = useBlobUrl(m.blob);
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${m.title || "Фото"} · ${fmtShort(m.date)}`}
      onClick={onToggle}
      className={cn(
        "press relative aspect-[3/4] overflow-hidden rounded-xl bg-muted text-left ring-2 transition-[box-shadow,transform]",
        selected ? "ring-primary" : "ring-transparent",
      )}
    >
      {url ? (
        <img src={url} alt="" draggable={false} className="h-full w-full object-cover" />
      ) : (
        <Skeleton className="h-full w-full rounded-none" />
      )}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-1.5 text-[11px] font-semibold text-white">
        {fmtShort(m.date)}
        {m.pose && (
          <span className="block truncate font-medium text-white/75">
            {VIEW_LABEL[m.pose]}
            {m.strain ? ` · ${STRAIN_LABEL[m.strain]}` : ""}
          </span>
        )}
      </span>
      {selected && (
        <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
          <Check className="h-4 w-4" />
        </span>
      )}
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-11 shrink-0 rounded-full px-3.5 text-sm font-semibold transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

function HoldHint() {
  return (
    <p className="text-center text-xs text-muted-foreground">
      Удерживай фото, чтобы выбрать несколько — объединить в группу, сравнить или удалить.
    </p>
  );
}

/** Goal-album cell: tap opens, hold enters multi-select, «···» edits. */
function GoalCell({
  m,
  selectMode,
  selected,
  onTap,
  onHold,
  onEdit,
  onDelete,
}: {
  m: MediaItem;
  selectMode: boolean;
  selected: boolean;
  onTap: () => void;
  onHold: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const press = useLongPress(() => {
    markLongPress();
    onHold();
  });
  return (
    <div
      {...press}
      role="checkbox"
      aria-checked={selectMode ? selected : undefined}
      aria-label={m.title || "Фото"}
      tabIndex={0}
      onClick={() => {
        if (consumeLongPress()) return;
        onTap();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onTap();
        }
      }}
      className="relative cursor-pointer rounded-2xl outline-none [touch-action:pan-y] focus-visible:ring-4 focus-visible:ring-ring/30"
    >
      <PhotoTile m={m} big selectMode={selectMode} selected={selected} />
      <span
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="absolute right-1.5 top-1.5"
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Действия с фото"
              onClick={(e) => e.stopPropagation()}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground/60 text-background"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52 rounded-2xl">
            <DropdownMenuItem className="min-h-[44px] text-[15px]" onSelect={onEdit}>
              <Pencil className="h-4 w-4" /> Изменить
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-[44px] text-[15px] text-destructive focus:text-destructive"
              onSelect={onDelete}
            >
              <Trash2 className="h-4 w-4" /> Удалить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </div>
  );
}

function LinkDialog({
  open,
  album,
  onClose,
}: {
  open: boolean;
  album: Album;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [clips, setClips] = useState("");
  const k = parseLink(url);
  const canClip = k?.type === "youtube" || k?.type === "video";
  const field = "w-full rounded-2xl border-2 px-4 outline-none focus:border-primary";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-3xl">
        <DialogTitle>Добавить по ссылке</DialogTitle>
        <input
          className={cn(field, "h-12")}
          placeholder="https://youtube.com/… или ссылка на фото/видео"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        {url && !k && <p className="text-sm text-destructive">Это не похоже на ссылку</p>}
        {k && (
          <div className="aspect-video overflow-hidden rounded-2xl bg-muted">
            <LinkMedia url={url} clips={parseClips(clips)} controls />
          </div>
        )}
        {canClip && (
          <textarea
            rows={2}
            className={cn(field, "py-3")}
            placeholder={"Таймкоды (необязательно), каждый с новой строки:\n1:20-1:45"}
            value={clips}
            onChange={(e) => setClips(e.target.value)}
          />
        )}
        <p className="text-xs text-muted-foreground">
          Файл не скачивается — он загрузится из интернета, когда ты его откроешь.
        </p>
        <TapButton
          disabled={!k}
          onClick={async () => {
            await addLink(
              url.trim(),
              album,
              k!.type === "image" ? "image" : "video",
              canClip ? parseClips(clips) : undefined,
            );
            toast.success("Добавлено");
            setUrl("");
            setClips("");
            onClose();
          }}
        >
          Добавить
        </TapButton>
      </DialogContent>
    </Dialog>
  );
}
