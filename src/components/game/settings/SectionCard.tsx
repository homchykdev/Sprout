import type { ReactNode } from "react";

export const field =
  "w-full rounded-2xl border-2 bg-card px-4 py-3 text-[15px] outline-none focus:border-primary";

export const selectField = "rounded-xl border-2 bg-card px-3 py-2 text-sm font-semibold";

/** One settings group: soft card with a bold title. */
export function SectionCard({
  title,
  children,
  hint,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="card-soft space-y-3 p-5">
      <h2 className="font-bold">{title}</h2>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </section>
  );
}
