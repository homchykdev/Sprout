import { useEffect, useState } from "react";
import { freshBadges, monthlyChallenge } from "@/lib/achievements";
import { useApp } from "@/lib/store";

/** Fires confetti once for freshly unlocked badges / monthly medal, then marks them seen. */
export function useCelebrate(): boolean {
  const [party, setParty] = useState(false);
  useEffect(() => {
    const st = useApp.getState();
    const now = new Date();
    const ch = monthlyChallenge(st.sessions, now);
    const fresh = [
      ...freshBadges(st, st.badgesSeen, now),
      ...(ch.claimed && !st.medalsSeen.includes(ch.key) ? [`medal:${ch.key}`] : []),
    ];
    if (!fresh.length) return;
    setParty(true);
    const t = setTimeout(() => setParty(false), 3200);
    st.set({
      badgesSeen: [...st.badgesSeen, ...fresh.filter((f) => !f.startsWith("medal:"))],
      medalsSeen: [
        ...st.medalsSeen,
        ...fresh.filter((f) => f.startsWith("medal:")).map((f) => f.slice(6)),
      ],
    });
    return () => clearTimeout(t);
  }, []);
  return party;
}
