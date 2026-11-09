import { Link, type LinkProps } from "@tanstack/react-router";
import { useId } from "react";
import { GroupedListChevron } from "@/components/patterns/GroupedList";
import { cn } from "@/lib/utils";

interface SummaryPanelProps extends React.ComponentProps<"section"> {
  title: string;
}

/**
 * SummaryPanel is a white panel on Início that sums up one destination under a footnote title. Its
 * body grows, so the SummaryLink after it lines up across panels side by side.
 */
export function SummaryPanel({ title, className, children, ...props }: SummaryPanelProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn("flex flex-col rounded-lg glass p-6", className)}
      {...props}
    >
      <h2 id={titleId} className="text-footnote tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function SummaryBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mt-2 flex flex-1 flex-col gap-1", className)} {...props} />;
}

/** SummaryFigure is a panel's key figure with its label above. */
export function SummaryFigure({ label, figure }: { label: string; figure: string }) {
  return (
    <>
      <p className="text-callout text-muted-foreground">{label}</p>
      <p className="text-large-title font-semibold">{figure}</p>
    </>
  );
}

/** SummaryLink drills into the panel's destination from a hairline row at the panel's bottom. */
export function SummaryLink({ to, children }: { to: LinkProps["to"]; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="mt-6 flex items-center justify-between gap-4 border-t pt-4 text-callout transition-colors hover:text-muted-foreground"
    >
      {children}
      <GroupedListChevron />
    </Link>
  );
}
