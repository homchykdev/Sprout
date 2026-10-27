import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search, Sparkles, Trash2, Youtube } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AiYoutubeTab } from "@/components/game/AiYoutubeTab";
import { blankExercise, ExerciseEditor } from "@/components/game/ExerciseEditor";
import { TapButton } from "@/components/game/TapButton";
import { ExerciseThumb } from "@/components/game/ExerciseThumb";
import { aiCreateExercise } from "@/lib/clients";
import { useApp } from "@/lib/store";
import { CATEGORIES, MUSCLES, type Category, type Exercise } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "Упражнения · Пульс" },
      {
        name: "description",
        content: "Библиотека упражнений: свои упражнения и генерация с ИИ.",
      },
      { property: "og:title", content: "Упражнения · Пульс" },
      {
        property: "og:description",
        content: "Библиотека упражнений с видео и советами по технике.",
      },
    ],
  }),
  component: Library,
});

function Library() {
  return (
    <div className="space-y-4">
      <h1 className="pt-2 text-3xl font-extrabold tracking-tight">Упражнения</h1>
      <LibraryContent />
    </div>
  );
}

export function LibraryContent() {
  const { exercises, deleteExercise, ai } = useApp();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category | "all">("all");
  const [edit, setEdit] = useState<Exercise | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [ytOpen, setYtOpen] = useState(false);
  const needsKeys = (open: () => void) => () =>
    ai.keys.length ? open() : toast("Добавьте ИИ-ключ в Настройках");

  const list = useMemo(
    () =>
      exercises.filter(
        (e) =>
          (cat === "all" || e.category === cat) && e.name.toLowerCase().includes(q.toLowerCase()),
      ),
    [exercises, q, cat],
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <TapButton size="sm" onClick={() => setEdit(blankExercise())}>
          <Plus className="h-4 w-4" /> Своё
        </TapButton>
        <TapButton size="sm" variant="sky" onClick={needsKeys(() => setYtOpen(true))}>
          <Youtube className="h-4 w-4" /> Из YouTube
        </TapButton>
        <TapButton size="sm" variant="flame" onClick={needsKeys(() => setAiOpen(true))}>
          <Sparkles className="h-4 w-4" /> ИИ
        </TapButton>
      </div>
      <label className="flex items-center gap-2 rounded-2xl border-2 bg-card px-4">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          className="h-12 flex-1 bg-transparent outline-none"
          placeholder="Поиск"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(["all", ...Object.keys(CATEGORIES)] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCat(c as Category | "all")}
            className={cn(
              "press shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold",
              cat === c ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
            )}
          >
            {c === "all" ? "Все" : CATEGORIES[c as Category]}
          </button>
        ))}
      </div>
      <div className="space-y-2.5">
        {list.map((e) => (
          <div
            key={e.id}
            className="card-soft press flex cursor-pointer items-center gap-3 p-3.5"
            onClick={() => setEdit(e)}
          >
            <ExerciseThumb ex={e} className="h-12 w-12" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{e.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {CATEGORIES[e.category]} · {e.muscles.map((m) => MUSCLES[m]).join(", ")}
                {e.bpm ? ` · ♩${e.bpm}` : ""}
              </p>
            </div>
            <button
              aria-label="Удалить"
              className="rounded-full p-2 text-muted-foreground hover:bg-muted"
              onClick={(ev) => {
                ev.stopPropagation();
                if (confirm(`Удалить «${e.name}»?`)) deleteExercise(e.id);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {!list.length && (
          <p className="py-10 text-center text-muted-foreground">Ничего не найдено</p>
        )}
      </div>
      <ExerciseEditor value={edit} onClose={() => setEdit(null)} />
      <AiDialog
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onDone={(e) => {
          setAiOpen(false);
          setEdit(e);
        }}
      />
      <AiYoutubeDialog open={ytOpen} onClose={() => setYtOpen(false)} />
    </div>
  );
}

function AiDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (e: Exercise) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>Создать упражнение с ИИ</DialogTitle>
        </DialogHeader>
        <AiTextTab onDone={onDone} />
      </DialogContent>
    </Dialog>
  );
}

function AiYoutubeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>Разобрать YouTube-видео</DialogTitle>
        </DialogHeader>
        <AiYoutubeTab onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function AiTextTab({ onDone }: { onDone: (e: Exercise) => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3">
      <textarea
        rows={3}
        className="w-full rounded-2xl border-2 p-4 outline-none focus:border-primary"
        placeholder="напр. упражнение на осанку с резинкой"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <TapButton
        variant="flame"
        disabled={busy || q.length < 3}
        onClick={async () => {
          setBusy(true);
          try {
            onDone(await aiCreateExercise(q));
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Sparkles className="h-4 w-4" /> {busy ? "Создаю…" : "Создать"}
      </TapButton>
    </div>
  );
}
