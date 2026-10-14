import { create } from "zustand";
import { persist } from "zustand/middleware";

type SearchHit = { id: number; name: string; category: string; muscles: string[]; difficulty: string | null };
type Detail = { id: number; name: string; category: string; muscles: string[]; difficulty: string | null; steps: string[]; videoUrl: string | null };

interface MwCache {
  searches: Record<string, SearchHit[]>;
  exercises: Record<number, Detail>;
  token: { token: string; until: number } | null;
  month: string;
  requests: number;
  putSearch: (q: string, r: SearchHit[]) => void;
  putExercise: (id: number, d: Detail) => void;
  putToken: (t: { token: string; until: number }) => void;
  clear: () => void;
}

const thisMonth = () => new Date().toISOString().slice(0, 7);
const bump = (s: MwCache) => (s.month === thisMonth() ? { requests: s.requests + 1 } : { month: thisMonth(), requests: 1 });

/** On-device cache of MuscleWiki responses so repeat lookups don't spend API quota. */
export const useMwCache = create<MwCache>()(
  persist(
    (set) => ({
      searches: {},
      exercises: {},
      token: null,
      month: thisMonth(),
      requests: 0,
      putSearch: (q, r) => set((s) => ({ searches: { ...s.searches, [q]: r }, ...bump(s) })),
      putExercise: (id, d) => set((s) => ({ exercises: { ...s.exercises, [id]: d }, ...bump(s) })),
      putToken: (t) => set((s) => ({ token: t, ...bump(s) })),
      clear: () => set({ searches: {}, exercises: {}, token: null }),
    }),
    { name: "pulse-mw-cache" },
  ),
);
