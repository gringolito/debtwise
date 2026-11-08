import { cn } from "@/lib/utils";
import { InfoIcon } from "lucide-react";
import {
  GroupedListItem,
  GroupedListLabel,
  GroupedListRow,
  GroupedListValue,
} from "@/components/patterns/GroupedList";

/** SheetValueRow is a grouped list row that shows a value the owner can't change. */
export function SheetValueRow({
  label,
  children,
  className,
  ...props
}: React.ComponentProps<"li"> & { label: string }) {
  return (
    <GroupedListItem className={className} {...props}>
      <GroupedListRow>
        <GroupedListLabel className="text-muted-foreground">{label}</GroupedListLabel>{" "}
        <GroupedListValue className="text-foreground">{children}</GroupedListValue>{" "}
      </GroupedListRow>
    </GroupedListItem>
  );
}

/** SheetNote is a white panel with what the recorded value would change. */
export function SheetNote({ className, children, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      role="status"
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-callout",
        className,
      )}
      {...props}
    >
      <InfoIcon aria-hidden="true" strokeWidth={1.5} className="size-5 shrink-0 text-accent" />
      <span>{children}</span>
    </p>
  );
}
