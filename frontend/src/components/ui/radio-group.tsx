import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { CheckIcon } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

const radioGroupVariants = cva("grid w-full", {
  variants: {
    layout: {
      default: "gap-2",
      /** Side-by-side choice cards, such as SAC and Price. */
      cards: "grid-cols-2 gap-4",
      /** Rows of an inset grouped list, which draws its own separators. */
      rows: "gap-0",
    },
  },
  defaultVariants: { layout: "default" },
});

function RadioGroup({
  className,
  layout,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root> &
  VariantProps<typeof radioGroupVariants>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn(radioGroupVariants({ layout }), className)}
      {...props}
    />
  );
}

// The checked item is a soft-accent disc with a check, the selection mark DESIGN.md gives choice
// cards and rows, rather than upstream's primary disc with a dot.
function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "group/radio-group-item peer relative flex aspect-square size-6 shrink-0 rounded-full border border-input bg-card outline-none group-has-[:focus-visible]/field-label:ring-0 group-has-[:focus-visible]/field-label:not-data-checked:border-input after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-checked:border-accent-soft data-checked:bg-accent-soft data-checked:text-graphite-foreground",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex size-full items-center justify-center"
      >
        <CheckIcon aria-hidden="true" strokeWidth={2.5} className="size-3.5" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };
