import { cn } from "cn";

/** Figures lists a panel's headline figures, one per row. */
export function Figures({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul className={cn("flex flex-col gap-2", className)} {...props} />;
}

type FigureProps = React.ComponentProps<"li"> & { name: string };

export function Figure({ name, className, children, ...props }: FigureProps) {
  return (
    <li className={cn("flex justify-between gap-4", className)} {...props}>
      <span className="text-muted-foreground">{name}</span> <span>{children}</span>
    </li>
  );
}
