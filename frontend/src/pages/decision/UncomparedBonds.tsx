import { useId } from "react";
import {
  GroupedList,
  GroupedListHeader,
  GroupedListItem,
  GroupedListLabel,
  GroupedListRow,
  GroupedListSection,
  GroupedListValue,
} from "@/components/patterns/GroupedList";
import type { Verdict } from "@/lib/api";
import { bondRate } from "@/lib/bondKinds";
import {
  type NoComparison,
  noComparisonOf,
  unavailableLabels,
  verdictKey,
  verdictTitle,
} from "@/lib/decisions";
import { formatMoney } from "@/lib/format";
import { NoComparisonFix } from "@/pages/decision/NoComparisonPanel";

function BondName({ verdict }: { verdict: Verdict }) {
  return (
    <span>
      {verdictTitle(verdict)}
      <span className="text-callout text-muted-foreground">
        {" · "}
        {bondRate(verdict.type, verdict.rate)}
      </span>
    </span>
  );
}

// One sentence on why a bond in the list is not compared.
function note(why: NoComparison): string {
  switch (why.reason) {
    case "amount_too_small":
      return `Compra a partir de ${formatMoney(why.minimumAmount)}.`;
    case "missing_ipca":
      return "Depende de um IPCA que ainda não foi divulgado nem pode ser projetado.";
    case "no_bond":
      return "";
  }
}

function UnavailableRow({
  verdict,
  onUseAmount,
}: {
  verdict: Verdict;
  onUseAmount: (amount: string) => void;
}) {
  const why = noComparisonOf(verdict);
  return (
    <GroupedListRow className="items-start">
      <GroupedListLabel className="flex flex-col items-start gap-1">
        <BondName verdict={verdict} />
        {why && (
          <>
            <span className="text-footnote text-muted-foreground">{note(why)}</span>
            <NoComparisonFix why={why} onUseAmount={onUseAmount} />
          </>
        )}
      </GroupedListLabel>
      {verdict.unavailable && (
        <GroupedListValue className="text-callout">
          {unavailableLabels[verdict.unavailable]}
        </GroupedListValue>
      )}
    </GroupedListRow>
  );
}

interface UncomparedBondsProps {
  /** The verdicts with no comparison, each with why. */
  verdicts: Verdict[];
  /** Puts the amount in the sentence and compares it. */
  onUseAmount: (amount: string) => void;
}

/** UncomparedBonds lists the bonds the decision could not compare, with why and what to try. */
export function UncomparedBonds({ verdicts, onUseAmount }: UncomparedBondsProps) {
  const headerId = useId();
  if (verdicts.length === 0) return null;
  return (
    <GroupedListSection aria-labelledby={headerId}>
      <GroupedListHeader id={headerId}>Títulos sem comparação</GroupedListHeader>
      <GroupedList>
        {verdicts.map((verdict) => (
          <GroupedListItem key={verdictKey(verdict)}>
            <UnavailableRow verdict={verdict} onUseAmount={onUseAmount} />
          </GroupedListItem>
        ))}
      </GroupedList>
    </GroupedListSection>
  );
}
