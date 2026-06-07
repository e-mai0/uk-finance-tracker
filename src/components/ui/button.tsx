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

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-50",
  secondary:
    "bg-surface-2 text-ink border border-border-strong hover:bg-surface disabled:opacity-50",
  outline:
    "border border-border-strong bg-surface text-ink hover:bg-surface-2 hover:border-ink/40 disabled:opacity-50",
  ghost: "text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-50",
  danger:
    "bg-danger text-white hover:bg-danger/90 disabled:opacity-50",
  // Editorial text action — breaks the twin-button cliché.
  link: "text-ink underline decoration-border-strong underline-offset-4 hover:text-accent hover:decoration-accent",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm rounded-[var(--radius-control)] gap-1.5",
  md: "h-10 px-4 text-sm rounded-[var(--radius-control)] gap-2",
  lg: "h-11 px-5 text-[0.95rem] rounded-[var(--radius-control)] gap-2",
  icon: "h-9 w-9 rounded-[var(--radius-control)]",
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
        "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
