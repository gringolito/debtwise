import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import type { SaleGain } from "@/lib/investments";

const signs: Record<SaleGain["kind"], string> = { gain: "+ ", loss: "− ", even: "" };
const colors: Record<SaleGain["kind"], string> = {
  gain: "text-positive",
  loss: "text-destructive",
  even: "",
};
/**
 * SaleGainAmount writes what selling gains over holding, green for a gain and red for a loss, with
 * its sign unless a sentence around it says which way it goes.
 */
export function SaleGainAmount({
  gain,
  signed = true,
  className,
}: {
  gain: SaleGain;
  signed?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("tabular-nums", colors[gain.kind], className)}>
      {signed && signs[gain.kind]}
      {formatMoney(gain.amount)}
    </span>
  );
}
