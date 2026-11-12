import { useId } from "react";
import {
  GroupedList,
  GroupedListChevron,
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
  type ComparedVerdict,
  type Favoured,
  favoured,
  type NoComparison,
  noComparisonOf,
  signedAdvantage,
  unavailableLabels,
  verdictKey,
  verdictTitle,
} from "@/lib/decisions";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePrototypeVariant } from "@/prototypes/variant";
import { NoComparisonFix } from "@/pages/decision/NoComparisonPanel";

const colors: Record<Favoured, string> = {
  invest: "text-positive",
  prepay: "text-destructive",
  even: "text-foreground",
};

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

interface OtherBondsProps {
  /** The compared verdicts besides the one on the card, ranked. */
  compared: ComparedVerdict[];
  /** The verdicts with no comparison, each with why. */
  unavailable: Verdict[];
  onSelect: (verdict: ComparedVerdict) => void;
  /** Puts the amount in the sentence and compares it. */
  onUseAmount: (amount: string) => void;
}

/**
 * OtherBonds lists the bonds besides the one on the verdict card, ranked by their Advantage, and
 * opens the one the owner picks on the card. The bonds with no comparison follow, with why and
 * what to try.
 */
export function OtherBonds({ compared, unavailable, onSelect, onUseAmount }: OtherBondsProps) {
  const headerId = useId();
  const proto = usePrototypeVariant() !== "A";
  if (compared.length === 0 && unavailable.length === 0) return null;
  return (
    <GroupedListSection aria-labelledby={headerId}>
      <GroupedListHeader id={headerId}>Outros títulos</GroupedListHeader>
      <GroupedList>
        {compared.map((verdict) => (
          <GroupedListItem key={verdictKey(verdict)}>
            <GroupedListRow asChild>
              <button type="button" onClick={() => onSelect(verdict)}>
                <GroupedListLabel>
                  <BondName verdict={verdict} />
                </GroupedListLabel>
                <GroupedListValue
                  className={cn("font-medium", !proto && colors[favoured(verdict.advantage)])}
                >
                  {proto
                    ? `${formatMoney(verdict.advantage.replace("-", ""))} ${verdict.advantage.startsWith("-") ? "a menos" : "a mais"}`
                    : signedAdvantage(verdict.advantage)}
                </GroupedListValue>
                <GroupedListChevron />
              </button>
            </GroupedListRow>
          </GroupedListItem>
        ))}
        {unavailable.map((verdict) => (
          <GroupedListItem key={verdictKey(verdict)}>
            <UnavailableRow verdict={verdict} onUseAmount={onUseAmount} />
          </GroupedListItem>
        ))}
      </GroupedList>
    </GroupedListSection>
  );
}
