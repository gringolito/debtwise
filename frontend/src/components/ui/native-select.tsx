import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { ChevronDownIcon } from "lucide-react";

const selectVariants = cva(
  "w-full min-w-0 appearance-none bg-transparent transition-colors outline-none select-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        default:
          "h-8 rounded-lg border border-input py-1 pr-8 pl-2.5 text-callout focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=sm]:h-7 data-[size=sm]:py-0.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        /** Chosen in place on a grouped list row: borderless and right-aligned, as the row's value. */
        inline:
          "cursor-pointer rounded-lg py-1 pr-6 pl-1 text-body [text-align-last:right] focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:text-destructive",
        /** Chosen in place inside a table row: borderless, left-aligned, so the value reads as text. */
        text: "cursor-pointer rounded-lg py-1 pr-6 pl-1 text-body focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:text-destructive",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> & {
  size?: "sm" | "default";
  variant?: "default" | "inline" | "text";
};

function NativeSelect({
  className,
  size = "default",
  variant = "default",
  ...props
}: NativeSelectProps) {
  return (
    <div
      className={cn(
        "group/native-select relative w-fit has-[select:disabled]:opacity-50",
        // A long option must not push its row's label out: the select shrinks, bounded to the share
        // of the row that leaves the label and its message room.
        variant === "inline" && "max-w-[60%] min-w-0",
        className,
      )}
      data-slot="native-select-wrapper"
      data-size={size}
    >
      <select
        data-slot="native-select"
        data-size={size}
        data-variant={variant}
        className={selectVariants({ variant })}
        {...props}
      />
      <ChevronDownIcon
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground select-none",
          variant === "default" ? "right-2.5 size-4" : "right-1 size-4",
        )}
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  );
}

function NativeSelectOption({ className, ...props }: React.ComponentProps<"option">) {
  return (
    <option
      data-slot="native-select-option"
      className={cn("bg-popover text-popover-foreground", className)}
      {...props}
    />
  );
}

function NativeSelectOptGroup({ className, ...props }: React.ComponentProps<"optgroup">) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn("bg-popover text-popover-foreground", className)}
      {...props}
    />
  );
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };
