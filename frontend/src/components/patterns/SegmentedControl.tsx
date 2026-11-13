import { cn } from "@/lib/utils";
import { ToggleGroup } from "radix-ui";

type RootProps = React.ComponentProps<typeof ToggleGroup.Root>;

interface SegmentedControlProps<T extends string>
  extends Omit<RootProps, "type" | "value" | "defaultValue" | "onValueChange"> {
  value: T;
  onValueChange: (value: T) => void;
  /**
   * Whether the control heads a section or a panel: under sm it then spans the width, its segments
   * 44px tall and sharing it. One inside a form row keeps its size.
   */
  fill?: boolean;
}

/** A two- or three-way choice where one segment is always selected. */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  fill = false,
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
      data-fill={fill ? "" : undefined}
      className={cn(
        "group/segmented inline-flex gap-0.5 rounded-lg bg-foreground/5 p-0.5",
        fill && "max-sm:flex max-sm:w-full",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A segment is 32px tall; under md its touch area reaches 44px past its edges without moving
 * anything, and in a control that fills the width, under sm, the segment itself is 44px.
 */
export function SegmentedControlItem({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroup.Item>) {
  return (
    <ToggleGroup.Item
      className={cn(
        "h-8 rounded-lg px-4 text-callout font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-xs max-md:relative max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-1.5 group-data-fill/segmented:max-sm:h-11 group-data-fill/segmented:max-sm:min-w-0 group-data-fill/segmented:max-sm:flex-1 group-data-fill/segmented:max-sm:px-2",
        className,
      )}
      {...props}
    />
  );
}
