import { CheckIcon } from "lucide-react";
import { formatMoney } from "@/lib/format";

/** Drift is a statement's difference from the schedule, marked as rounding or as real drift. */
export function Drift({ amount, withinRounding }: { amount: string; withinRounding: boolean }) {
  return withinRounding ? (
    <span className="inline-flex items-center gap-1.5 text-positive">
      <CheckIcon role="img" aria-label="Arredondamento" strokeWidth={2} className="size-4" />
      {formatMoney(amount)}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-caution">
      <svg
        role="img"
        aria-label="Acima do arredondamento"
        viewBox="0 0 8 8"
        className="size-2 fill-current"
      >
        <circle cx="4" cy="4" r="4" />
      </svg>
      {formatMoney(amount)}
    </span>
  );
}
