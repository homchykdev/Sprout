import type { MediaItem } from "@/lib/media";
import { consumeLongPress, markLongPress, useLongPress } from "@/hooks/use-long-press";
import { maxGroupDate, toGroups, type PhotoGroup as Group } from "@/lib/photo-groups";
import { PhotoTile } from "./PhotoTile";

const fmtDay = (d: string) =>
  new Date(d + "T00:00").toLocaleDateString("ru", { day: "numeric", month: "long" });
const fmtMonth = (d: string) => {
  const s = new Date(d + "T00:00").toLocaleDateString("ru", { month: "long", year: "numeric" });
  return s[0]!.toUpperCase() + s.slice(1);
};

export type { PhotoGroup as Group } from "@/lib/photo-groups";

interface TimelineProps {
  items: MediaItem[];
  selectMode: boolean;
  selected: string[];
  onToggle: (id: string) => void;
  onToggleGroup: (g: Group) => void;
  onOpen: (m: MediaItem) => void;
  onOpenGroup: (groupId: string) => void;
  /** Long-press enters multi-select (no selection-mode button anymore). */
  onHoldItem: (m: MediaItem) => void;
  onHoldGroup: (g: Group) => void;
}

/** Progress timeline: single photos and group cards, grouped by month. */
export function PhotoTimeline({
  items,
  selectMode,
  selected,
  onToggle,
  onToggleGroup,
  onOpen,
  onOpenGroup,
  onHoldItem,
  onHoldGroup,
}: TimelineProps) {
  const first = items[items.length - 1]!.date;
  type Entry = { entry: MediaItem | Group; key: string };
  const months: [month: string, list: Entry[]][] = [];
  for (const e of toGroups(items)) {
    const date = "items" in e.entry ? maxGroupDate(e.entry.items) : e.entry.date;
    const k = date.slice(0, 7);
    const last = months[months.length - 1];
    if (last && last[0] === k) last[1].push(e);
    else months.push([k, [e]]);
  }
  return (
    <div className="space-y-6">
      {months.map(([k, list]) => (
        <section key={k}>
          <h2 className="mb-3 text-lg font-bold">{fmtMonth(k + "-01")}</h2>
          <div className="relative space-y-4 border-l-2 border-muted pl-5">
            {list.map(({ entry, key }) => (
              <div key={key} className="relative">
                <span className="absolute -left-[27px] top-3 h-3 w-3 rounded-full border-2 border-card bg-primary" />
                {"items" in entry ? (
                  <GroupCard
                    g={entry}
                    first={first}
                    selectMode={selectMode}
                    selected={selected}
                    onToggle={() => onToggleGroup(entry)}
                    onOpen={() => onOpenGroup(entry.id)}
                    onHold={() => onHoldGroup(entry)}
                  />
                ) : (
                  <EntryCard
                    m={entry}
                    first={first}
                    selectMode={selectMode}
                    selected={selected.includes(entry.id)}
                    onTap={() => (selectMode ? onToggle(entry.id) : onOpen(entry))}
                    onHold={() => onHoldItem(entry)}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function EntryCard({
  m,
  first,
  selectMode,
  selected,
  onTap,
  onHold,
}: {
  m: MediaItem;
  first: string;
  selectMode: boolean;
  selected: boolean;
  onTap: () => void;
  onHold: () => void;
}) {
  const day = Math.round((+new Date(m.date) - +new Date(first)) / 864e5);
  const press = useLongPress(() => {
    markLongPress();
    onHold();
  });
  return (
    <button
      onClick={() => {
        if (consumeLongPress()) return;
        onTap();
      }}
      {...press}
      className="card-soft press flex w-full gap-3 p-3 text-left [touch-action:pan-y]"
      aria-pressed={selectMode ? selected : undefined}
    >
      <PhotoTile m={m} className="h-24 w-20 shrink-0" selectMode={selectMode} selected={selected} />
      <div className="min-w-0 flex-1 py-1">
        <p className="text-xs font-bold uppercase tracking-wide text-primary-shade">
          {fmtDay(m.date)} · {day === 0 ? "старт" : `день ${day}`}
        </p>
        <p className="truncate font-semibold">
          {m.title || (m.kind === "video" ? "Видео" : "Фото")}
        </p>
        {m.note && <p className="line-clamp-2 text-sm text-muted-foreground">{m.note}</p>}
      </div>
    </button>
  );
}

function GroupCard({
  g,
  first,
  selectMode,
  selected,
  onToggle,
  onOpen,
  onHold,
}: {
  g: Group;
  first: string;
  selectMode: boolean;
  selected: string[];
  onToggle: () => void;
  onOpen: () => void;
  onHold: () => void;
}) {
  const all = g.items.every((x) => selected.includes(x.id));
  const dates = [...new Set(g.items.map((x) => x.date))].sort();
  const day = Math.round((+new Date(maxGroupDate(g.items)) - +new Date(first)) / 864e5);
  const press = useLongPress(() => {
    markLongPress();
    onHold();
  });
  return (
    <button
      onClick={() => {
        if (consumeLongPress()) return;
        if (selectMode) onToggle();
        else onOpen();
      }}
      {...press}
      className="card-soft press flex w-full gap-3 p-3 text-left [touch-action:pan-y]"
      aria-pressed={selectMode ? all : undefined}
    >
      <div className="relative h-24 w-20 shrink-0">
        <PhotoTile m={g.cover} className="h-24 w-20" selectMode={selectMode} selected={all} />
        <span className="absolute -bottom-1.5 -right-1.5 rounded-full bg-foreground px-2 py-0.5 text-[11px] font-bold text-background tabular">
          +{g.items.length}
        </span>
      </div>
      <div className="min-w-0 flex-1 py-1">
        <p className="text-xs font-bold uppercase tracking-wide text-primary-shade">
          {dates.length > 1
            ? `${fmtDay(dates[0]!)} — ${fmtDay(dates[dates.length - 1]!)}`
            : fmtDay(dates[0]!)}{" "}
          · {day === 0 ? "старт" : `день ${day}`}
        </p>
        <p className="truncate font-semibold">
          {g.cover.title || `Группа · ${g.items.length} фото`}
        </p>
        {g.cover.note && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{g.cover.note}</p>
        )}
      </div>
    </button>
  );
}
