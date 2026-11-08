import { Badge } from "@/components/ui/badge";
import type { CorrectionIndex } from "@/lib/api";
import { formatDate, formatMonth, formatPercent, formatPeriod } from "@/lib/format";
import { indexNames } from "@/lib/indexNames";
import { projectedByText } from "@/lib/projectionMethods";

// TR runs from one day to the same day of the next month; IPCA is a calendar month, which the API
// sends as a single day; the Selic target is the one day it was set.
function indexPeriod({ index, period_start, period_end }: CorrectionIndex): string {
  if (index === "selic_target") return formatDate(period_start);
  return index === "ipca" ? formatMonth(period_start) : formatPeriod(period_start, period_end);
}

export function IndexCell({ indexValues }: { indexValues: CorrectionIndex[] }) {
  if (indexValues.length === 0) return <>—</>;
  return (
    <>
      {indexValues.map((index) => (
        <div key={`${index.index}-${index.period_start}`}>
          <span>{indexNames[index.index]}</span>{" "}
          {index.status === "missing" ? (
            <Badge variant="outline">Sem índice</Badge>
          ) : (
            <span>{index.value && formatPercent(index.value)}</span>
          )}{" "}
          {index.status === "projected" && <Badge variant="secondary">Projetado</Badge>}{" "}
          <span className="block text-footnote text-muted-foreground">{indexPeriod(index)}</span>{" "}
          {index.status === "projected" && (
            <span className="block text-footnote text-muted-foreground">
              {projectedByText(index.methods)}
            </span>
          )}
        </div>
      ))}
    </>
  );
}
