import { cn } from "@/lib/utils";

export function Page({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-10", className)} {...props} />;
}

export function PageHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header className={cn("flex items-baseline justify-between gap-4", className)} {...props} />
  );
}

export function PageTitle({ className, ...props }: React.ComponentProps<"h1">) {
  return <h1 className={cn("text-large-title", className)} {...props} />;
}
