import { cn } from "@/lib/utils";
import { ChevronRightIcon } from "lucide-react";
import { Slot } from "radix-ui";

export function GroupedListSection({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("flex flex-col gap-2", className)} {...props} />;
}

export function GroupedListHeader({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn("px-4 text-footnote tracking-wide text-muted-foreground uppercase", className)}
      {...props}
    />
  );
}

export function GroupedList({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul className={cn("overflow-hidden rounded-lg glass", className)} {...props} />;
}

export function GroupedListItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      className={cn(
        "relative not-last:after:absolute not-last:after:right-0 not-last:after:bottom-0 not-last:after:left-4 not-last:after:h-px not-last:after:bg-border",
        className,
      )}
      {...props}
    />
  );
}

/** A row is a link or button through asChild when it drills in or acts. */
export function GroupedListRow({
  asChild = false,
  className,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp
      className={cn(
        "flex min-h-13 w-full items-center gap-4 px-4 py-3 text-left text-body outline-none focus-visible:bg-muted [&:is(a,button)]:transition-colors [&:is(a,button)]:hover:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

export function GroupedListLabel({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("min-w-0 flex-1", className)} {...props} />;
}

export function GroupedListValue({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("text-right text-muted-foreground", className)} {...props} />;
}

export function GroupedListChevron({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <ChevronRightIcon
      aria-hidden="true"
      strokeWidth={1.5}
      className={cn("-mr-1 size-5 shrink-0 text-tertiary-foreground", className)}
      {...props}
    />
  );
}
