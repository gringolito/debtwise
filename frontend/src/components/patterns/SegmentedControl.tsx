import { cn } from "@/lib/utils";
import { ToggleGroup } from "radix-ui";

type RootProps = React.ComponentProps<typeof ToggleGroup.Root>;

interface SegmentedControlProps<T extends string>
  extends Omit<RootProps, "type" | "value" | "defaultValue" | "onValueChange"> {
  value: T;
  onValueChange: (value: T) => void;
}

/** A two- or three-way choice where one segment is always selected. */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  className,
  ...props
}: SegmentedControlProps<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next as T);
      }}
      className={cn("inline-flex gap-0.5 rounded-lg bg-foreground/5 p-0.5", className)}
      {...props}
    />
  );
}

export function SegmentedControlItem({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroup.Item>) {
  return (
    <ToggleGroup.Item
      className={cn(
        "h-8 rounded-lg px-4 text-callout font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-xs",
        className,
      )}
      {...props}
    />
  );
}
