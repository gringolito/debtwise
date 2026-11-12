import { cn } from "@/lib/utils";

export function Page({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-10", className)} {...props} />;
}

/** The title and its actions: when they don't fit in a line, the actions wrap under the title. */
export function PageHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 *:first:min-w-0",
        className,
      )}
      {...props}
    />
  );
}

export function PageTitle({ className, ...props }: React.ComponentProps<"h1">) {
  return <h1 className={cn("min-w-0 text-page-title wrap-break-word", className)} {...props} />;
}
