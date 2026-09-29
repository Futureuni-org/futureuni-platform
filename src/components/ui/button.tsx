"use client";

import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

/**
 * Button — the FUTUREUNI primary action primitive.
 *
 * Variants: primary, secondary, ghost, danger, link. Sizes: sm (h-9), md (h-10), lg (h-12), icon.
 * `loading` shows a spinner and disables the button; the label stays visible so the layout is
 * stable. Focus ring uses `--ring` and is always visible; touch targets meet 48px at `md` and up.
 */

const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-2 rounded-md",
    "text-sm font-semibold whitespace-nowrap",
    "transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:cursor-not-allowed disabled:opacity-60",
  ),
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-surface text-foreground border border-input hover:bg-primary-soft",
        ghost: "text-foreground hover:bg-primary-soft",
        danger: "bg-danger text-primary-foreground hover:bg-danger/90",
        link: "text-primary underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-12 px-5",
        lg: "h-14 px-6 text-base",
        icon: "h-12 w-12 p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading, disabled, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={loading === true || disabled === true}
      aria-busy={loading === true ? "true" : undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading === true && <Loader2 aria-hidden className="size-4 animate-spin" />}
      {children}
    </button>
  );
});

/** Icon-only button. Requires `aria-label` for the icon's meaning. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, "size"> & { "aria-label": string }
>(function IconButton({ className, variant = "ghost", children, ...props }, ref) {
  return (
    <Button
      ref={ref}
      variant={variant}
      size="icon"
      className={cn("size-10 min-h-10", className)}
      {...props}
    >
      {children}
    </Button>
  );
});
