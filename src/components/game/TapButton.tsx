import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const tap = cva(
  "inline-flex items-center justify-center gap-2 font-semibold select-none rounded-2xl transition-[transform,box-shadow,background-color] duration-150 active:translate-y-[3px] disabled:opacity-50 disabled:pointer-events-none outline-none focus-visible:ring-4 focus-visible:ring-ring/30",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground shadow-[0_4px_0_var(--primary-shade)] active:shadow-[0_1px_0_var(--primary-shade)]",
        flame: "bg-flame text-primary-foreground shadow-[0_4px_0_var(--flame-shade)] active:shadow-[0_1px_0_var(--flame-shade)]",
        sky: "bg-sky text-primary-foreground shadow-[0_4px_0_var(--sky-shade)] active:shadow-[0_1px_0_var(--sky-shade)]",
        soft: "bg-card text-foreground border-2 border-border shadow-[0_3px_0_var(--border)] active:shadow-[0_0_0_var(--border)]",
        ghost: "text-muted-foreground hover:bg-muted active:translate-y-0",
        danger: "bg-card text-destructive border-2 border-border shadow-[0_3px_0_var(--border)]",
      },
      size: {
        sm: "h-9 px-3.5 text-sm rounded-xl",
        md: "h-12 px-5 text-[15px]",
        lg: "h-14 px-7 text-base tracking-wide uppercase",
        icon: "h-11 w-11 rounded-full",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface TapButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof tap> {}

export const TapButton = forwardRef<HTMLButtonElement, TapButtonProps>(({ className, variant, size, ...p }, ref) => (
  <button ref={ref} className={cn(tap({ variant, size }), className)} {...p} />
));
TapButton.displayName = "TapButton";
