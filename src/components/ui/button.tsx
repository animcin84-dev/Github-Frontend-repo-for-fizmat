import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-8 items-center justify-center gap-2 rounded-full border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "border-transparent bg-[var(--accent)] px-3 text-[var(--accent-foreground)] hover:brightness-95",
        secondary: "border-[var(--border)] bg-[var(--surface-1)] px-3 text-[var(--foreground)] hover:bg-[var(--surface-2)]",
        ghost: "border-transparent bg-transparent px-2 text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]",
        danger: "border-transparent bg-[var(--danger)] px-3 text-white hover:brightness-95",
      },
      size: {
        sm: "h-8 text-xs",
        md: "h-9",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
