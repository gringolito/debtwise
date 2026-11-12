import { cva } from "class-variance-authority";
import { Children } from "react";
import { cn } from "@/lib/utils";

const keyFiguresVariants = cva(
  // Columns are as wide as their figure, which never wraps beside the others; stacked, a figure may
  // break at its spaces rather than spill out of the panel.
  "grid auto-cols-fit grid-flow-col divide-x rounded-lg glass p-6 whitespace-nowrap max-sm:auto-cols-auto max-sm:grid-flow-row max-sm:grid-cols-1 max-sm:divide-x-0 max-sm:divide-y max-sm:wrap-break-word max-sm:whitespace-normal max-sm:*:px-0 max-sm:*:py-3.5 max-sm:*:first:pt-0 max-sm:*:last:pb-0",
  {
    variants: {
      figures: {
        two: "",
        // Three figures need about 840px to sit side by side, so the panel measures its own space.
        three:
          "@max-three-figures:auto-cols-auto @max-three-figures:grid-flow-row @max-three-figures:grid-cols-1 @max-three-figures:divide-x-0 @max-three-figures:divide-y @max-three-figures:wrap-break-word @max-three-figures:whitespace-normal @max-three-figures:*:px-0 @max-three-figures:*:py-3.5 @max-three-figures:*:first:pt-0 @max-three-figures:*:last:pb-0",
      },
    },
    defaultVariants: { figures: "two" },
  },
);

/**
 * KeyFigures is a white panel of key figures side by side, split by hairlines. Under sm, and for
 * three figures when the panel is narrower than the three need, they stack, still split by hairlines.
 */
export function KeyFigures({ className, children, ...props }: React.ComponentProps<"dl">) {
  return (
    <div className="@container">
      <dl
        className={cn(
          keyFiguresVariants({ figures: Children.count(children) > 2 ? "three" : "two" }),
          className,
        )}
        {...props}
      >
        {children}
      </dl>
    </div>
  );
}

/** KeyFigure is one figure of KeyFigures: its name over the figure, and a note under it if it has one. */
export function KeyFigure({
  name,
  note,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { name: string; note?: string }) {
  return (
    <div className={cn("flex flex-col gap-1 px-6 first:pl-0 last:pr-0", className)} {...props}>
      <dt className="text-footnote tracking-wide text-muted-foreground uppercase">{name}</dt>
      <dd className="text-large-title">{children}</dd>
      {note && <dd className="text-footnote text-muted-foreground">{note}</dd>}
    </div>
  );
}
