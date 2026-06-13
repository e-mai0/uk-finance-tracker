import * as React from "react";
import { cn } from "@/lib/utils";

type Variant =
  | "primary"
  | "secondary"
  | "ghost"
  | "outline"
  | "danger"
  | "link";
type Size = "sm" | "md" | "lg" | "icon";

// GB+ contract: amber means agent — buttons are never amber. Primary commits
// are ink pills; secondary pills carry the 3:1 interactive border.
const variants: Record<Variant, string> = {
  primary:
    "bg-ink font-extrabold text-canvas hover:bg-chrome-2 disabled:opacity-50",
  secondary:
    "border border-border-interactive bg-surface font-bold text-ink hover:bg-surface-2 disabled:opacity-50",
  outline:
    "border border-border-interactive bg-surface font-bold text-ink hover:bg-surface-2 disabled:opacity-50",
  ghost: "font-bold text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-50",
  danger:
    "bg-danger font-bold text-white hover:bg-danger/90 disabled:opacity-50",
  // Editorial text action — breaks the twin-button cliché.
  link: "font-bold text-ink underline decoration-border-strong underline-offset-4 hover:decoration-ink",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3.5 text-[0.8125rem] rounded-pill gap-1.5",
  md: "h-10 px-4 text-[0.8125rem] rounded-pill gap-2",
  lg: "h-11 px-5 text-sm rounded-pill gap-2",
  icon: "h-9 w-9 rounded-pill",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        // Focus comes from the global :focus-visible outline (2px agent-mark).
        "inline-flex items-center justify-center transition-colors disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
