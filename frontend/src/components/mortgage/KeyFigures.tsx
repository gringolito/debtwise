import { cn } from "@/lib/utils";

/** KeyFigures is a white panel of key figures side by side, split by hairlines. */
export function KeyFigures({ className, ...props }: React.ComponentProps<"dl">) {
  return (
    <dl
      className={cn(
        "grid auto-cols-fr grid-flow-col divide-x rounded-lg glass px-6 py-6",
        className,
      )}
      {...props}
    />
  );
}

export function KeyFigure({
  name,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { name: string }) {
  return (
    <div className={cn("flex flex-col gap-1 px-6 first:pl-0 last:pr-0", className)} {...props}>
      <dt className="text-footnote tracking-wide text-muted-foreground uppercase">{name}</dt>
      <dd className="text-large-title">{children}</dd>
    </div>
  );
}
