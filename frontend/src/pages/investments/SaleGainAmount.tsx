import { formatMoney } from "@/lib/format";
import type { SaleGain } from "@/lib/investments";
import { cn } from "@/lib/utils";

/**
 * SaleGainAmount writes what selling gains over holding, without a sign: green when selling earns
 * more, the text colour otherwise (holding earning more is no loss), never red.
 */
export function SaleGainAmount({ gain, className }: { gain: SaleGain; className?: string }) {
  return (
    <span className={cn("tabular-nums", gain.kind === "gain" && "text-positive", className)}>
      {formatMoney(gain.amount)}
    </span>
  );
}
