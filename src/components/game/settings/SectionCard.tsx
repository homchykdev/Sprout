import type { ReactNode } from "react";
import { Settings2 } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const field =
  "w-full rounded-2xl border-2 bg-card px-4 py-3 text-[15px] outline-none focus:border-primary";

export const selectField = "rounded-xl border-2 bg-card px-3 py-2 text-sm font-semibold";

/**
 * One collapsible settings group. Each card is its own accordion so siblings stay open
 * independently; `defaultOpen` keeps the first page view short.
 * `changed` shows an unsaved badge next to the title while the draft is dirty.
 */
export function SectionCard({
  title,
  hint,
  defaultOpen = false,
  changed = false,
  children,
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  changed?: boolean;
  children: ReactNode;
}) {
  return (
    <Accordion
      type="single"
      collapsible
      {...(defaultOpen ? { defaultValue: "group" } : {})}
      className="card-soft px-5"
    >
      <AccordionItem value="group" className="border-b-0">
        <AccordionTrigger className="min-h-[44px] py-2.5 text-left hover:no-underline focus-visible:rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30">
          <span className="flex items-center gap-2">
            <span className="font-bold">{title}</span>
            {changed && (
              <span className="flex items-center gap-1 rounded-full bg-flame-soft px-2 py-0.5 text-[11px] font-bold text-flame-shade">
                <Settings2 className="h-3 w-3" aria-hidden /> изменено
              </span>
            )}
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-3 pb-5">{children}</div>
          {hint && <p className="pb-5 text-xs text-muted-foreground">{hint}</p>}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
