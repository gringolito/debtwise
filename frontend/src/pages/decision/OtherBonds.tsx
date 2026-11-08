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
  signedAdvantage,
  unavailableLabels,
  verdictKey,
  verdictTitle,
} from "@/lib/decisions";
import { cn } from "@/lib/utils";

const colors: Record<Favoured, string> = {
  invest: "text-positive",
  prepay: "text-destructive",
  even: "text-foreground",
};

function BondLabel({ verdict }: { verdict: Verdict }) {
  return (
    <GroupedListLabel>
      {verdictTitle(verdict)}
      <span className="text-callout text-muted-foreground">
        {" · "}
        {bondRate(verdict.type, verdict.rate)}
      </span>
    </GroupedListLabel>
  );
}

interface OtherBondsProps {
  /** The compared verdicts besides the one on the card, ranked. */
  compared: ComparedVerdict[];
  /** The verdicts with no comparison, each with why. */
  unavailable: Verdict[];
  onSelect: (verdict: ComparedVerdict) => void;
}

/**
 * OtherBonds lists the bonds besides the one on the verdict card, ranked by their Advantage, and
 * opens the one the owner picks on the card. The bonds with no comparison follow, with why.
 */
export function OtherBonds({ compared, unavailable, onSelect }: OtherBondsProps) {
  const headerId = useId();
  if (compared.length === 0 && unavailable.length === 0) return null;
  return (
    <GroupedListSection aria-labelledby={headerId}>
      <GroupedListHeader id={headerId}>Outros títulos</GroupedListHeader>
      <GroupedList>
        {compared.map((verdict) => (
          <GroupedListItem key={verdictKey(verdict)}>
            <GroupedListRow asChild>
              <button type="button" onClick={() => onSelect(verdict)}>
                <BondLabel verdict={verdict} />
                <GroupedListValue
                  className={cn("font-medium", colors[favoured(verdict.advantage)])}
                >
                  {signedAdvantage(verdict.advantage)}
                </GroupedListValue>
                <GroupedListChevron />
              </button>
            </GroupedListRow>
          </GroupedListItem>
        ))}
        {unavailable.map((verdict) => (
          <GroupedListItem key={verdictKey(verdict)}>
            <GroupedListRow>
              <BondLabel verdict={verdict} />
              {verdict.unavailable && (
                <GroupedListValue className="text-callout">
                  {unavailableLabels[verdict.unavailable]}
                </GroupedListValue>
              )}
            </GroupedListRow>
          </GroupedListItem>
        ))}
      </GroupedList>
    </GroupedListSection>
  );
}
