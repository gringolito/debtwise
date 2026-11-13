import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Focus shows the app-wide outline from index.css instead of upstream's translucent ring.
const inputVariants = cva(
  "min-w-0 transition-colors placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-body file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-callout file:font-medium file:text-foreground disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-callout dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        /** Typed in place on a grouped list row: borderless and right-aligned, as the row's value. */
        inline:
          "w-36 rounded-lg bg-transparent px-1 text-right text-body placeholder:text-tertiary-foreground aria-invalid:text-destructive",
        /** The one figure a screen asks for, as a hero figure underlined in the accent mark. */
        hero: "w-44 border-b-2 border-accent-mark bg-transparent text-center text-hero-figure placeholder:text-tertiary-foreground focus-visible:border-accent aria-invalid:border-destructive aria-invalid:text-destructive",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Input({
  className,
  type,
  variant,
  ...props
}: React.ComponentProps<"input"> & VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      data-variant={variant ?? "default"}
      className={cn(inputVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Input };
