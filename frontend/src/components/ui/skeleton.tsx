import { cn } from "@/lib/utils";

// Translucent rather than upstream's bg-muted, which matches the canvas and would vanish on it.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-pulse rounded-lg bg-foreground/5", className)}
      {...props}
    />
  );
}

export { Skeleton };
