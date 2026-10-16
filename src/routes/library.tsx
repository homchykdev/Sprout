import { createFileRoute } from "@tanstack/react-router";
import { Download, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AiYoutubeTab } from "@/components/game/AiYoutubeTab";
import { blankExercise, ExerciseEditor } from "@/components/game/ExerciseEditor";
import { TapButton } from "@/components/game/TapButton";
import { ExerciseThumb } from "@/components/game/ExerciseThumb";
import { aiCreateExercise, importFromMuscleWiki, searchMuscleWiki } from "@/lib/clients";
import { useApp } from "@/lib/store";
import { CATEGORIES, MUSCLES, type Category, type Exercise } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "Упражнения · Пульс" },
      {
        name: "description",
        content: "Библиотека упражнений: MuscleWiki, свои упражнения и генерация с ИИ.",
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
  const { exercises, deleteExercise, mwKey, ai } = useApp();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category | "all">("all");
  const [edit, setEdit] = useState<Exercise | null>(null);
  const [mwOpen, setMwOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

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
      <h1 className="pt-2 text-3xl font-extrabold tracking-tight">Упражнения</h1>
      <div className="flex gap-2">
        <TapButton size="sm" onClick={() => setEdit(blankExercise())}>
          <Plus className="h-4 w-4" /> Своё
        </TapButton>
        <TapButton
          size="sm"
          variant="sky"
          onClick={() => (mwKey ? setMwOpen(true) : toast("Добавьте ключ MuscleWiki в настройках"))}
        >
          <Download className="h-4 w-4" /> MuscleWiki
        </TapButton>
        <TapButton
          size="sm"
          variant="flame"
          onClick={() =>
            ai.keys.length ? setAiOpen(true) : toast("Добавьте ИИ-ключ в настройках")
          }
        >
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
      <MwDialog open={mwOpen} onClose={() => setMwOpen(false)} />
      <AiDialog
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onDone={(e) => {
          setAiOpen(false);
          setEdit(e);
        }}
      />
    </div>
  );
}

function MwDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { upsertExercise, exercises } = useApp();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ id: number; name: string; category: string }[]>([]);
  const [busy, setBusy] = useState<number | "s" | null>(null);
  const search = async () => {
    setBusy("s");
    try {
      setRes(await searchMuscleWiki(q));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>Импорт из MuscleWiki</DialogTitle>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <input
            className="h-12 flex-1 rounded-2xl border-2 px-4 outline-none focus:border-primary"
            placeholder="напр. barbell curl"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <TapButton disabled={q.length < 2 || busy === "s"}>
            {busy === "s" ? "…" : "Найти"}
          </TapButton>
        </form>
        <div className="space-y-2">
          {res.map((r) => {
            const added = exercises.some((e) => e.id === `mw-${r.id}`);
            return (
              <div key={r.id} className="flex items-center gap-3 rounded-2xl border-2 p-3">
                <div className="flex-1">
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.category}</p>
                </div>
                <TapButton
                  size="sm"
                  variant={added ? "soft" : "primary"}
                  disabled={added || busy === r.id}
                  onClick={async () => {
                    setBusy(r.id);
                    try {
                      upsertExercise(await importFromMuscleWiki(r.id));
                      toast.success("Добавлено");
                    } catch (e) {
                      toast.error((e as Error).message);
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {added ? "Есть" : busy === r.id ? "…" : "Добавить"}
                </TapButton>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
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
  const [tab, setTab] = useState<"text" | "yt">("text");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>Создать упражнение с ИИ</DialogTitle>
        </DialogHeader>
        <div className="flex rounded-2xl bg-muted p-1 text-sm font-semibold">
          {(["text", "yt"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 rounded-xl py-2 transition-colors",
                tab === t ? "bg-card shadow-sm" : "text-muted-foreground",
              )}
            >
              {t === "text" ? "Словами" : "YouTube-видео"}
            </button>
          ))}
        </div>
        {tab === "text" ? <AiTextTab onDone={onDone} /> : <AiYoutubeTab onClose={onClose} />}
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
