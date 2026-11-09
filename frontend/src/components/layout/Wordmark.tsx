import symbol from "@/assets/debtwise-symbol.svg";
import { cn } from "@/lib/utils";

export function Wordmark({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("flex items-center gap-2 text-title-2 tracking-tight select-none", className)}
      {...props}
    >
      <img src={symbol} alt="" className="size-8" />
      Debtwise
    </span>
  );
}
