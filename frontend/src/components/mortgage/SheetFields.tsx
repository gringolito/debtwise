import { cn } from "@/lib/utils";
import { InfoIcon } from "lucide-react";
import { useId } from "react";
import {
  GroupedListItem,
  GroupedListLabel,
  GroupedListRow,
  GroupedListValue,
} from "@/components/patterns/GroupedList";
import { Input } from "@/components/ui/input";

interface SheetInputRowProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** What the owner reads under an invalid input; the input is valid while it is undefined. */
  error?: string;
  type?: "text" | "date";
  inputMode?: "decimal";
  placeholder?: string;
}

/** SheetInputRow is a grouped list row whose value the owner types in place. */
export function SheetInputRow({ label, error, onChange, ...props }: SheetInputRowProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <GroupedListItem>
      <GroupedListRow>
        <label htmlFor={id} className="min-w-0 flex-1">
          {label}
        </label>
        <Input
          id={id}
          variant="inline"
          className="w-48"
          aria-invalid={error !== undefined || undefined}
          aria-describedby={error === undefined ? undefined : errorId}
          onChange={(event) => onChange(event.target.value)}
          {...props}
        />
      </GroupedListRow>
      {error !== undefined && (
        <p id={errorId} className="px-4 pb-3 text-footnote text-destructive">
          {error}
        </p>
      )}
    </GroupedListItem>
  );
}

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
