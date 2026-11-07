import { cn } from "@/lib/utils";

export function Wordmark({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span className={cn("text-title-2 tracking-tight select-none", className)} {...props}>
      DebtWise
    </span>
  );
}
