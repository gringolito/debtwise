import { useId, useState } from "react";
import {
  GroupedList,
  GroupedListHeader,
  GroupedListItem,
  GroupedListLabel,
  GroupedListRow,
  GroupedListSection,
  GroupedListValue,
} from "@/components/patterns/GroupedList";
import type { Decision } from "@/lib/api";
import { bondRate } from "@/lib/bondKinds";
import {
  breakEvenNote,
  type ComparedVerdict,
  noComparisons,
  rankVerdicts,
  verdictKey,
} from "@/lib/decisions";
import { formatMoney, formatNumber } from "@/lib/format";
import { projectedByText } from "@/lib/projectionMethods";
import { NoComparisonPanel } from "@/pages/decision/NoComparisonPanel";
import { ScenariosPrototype } from "@/pages/decision/Scenarios.prototype";
import { UncomparedBonds } from "@/pages/decision/UncomparedBonds";
import { VerdictPanel } from "@/pages/decision/VerdictPanel";
import { StaleNote } from "@/pages/marketdata/StaleNote";

function Details({ verdict }: { verdict: ComparedVerdict }) {
  const headerId = useId();
  const rows = [
    ["Taxa de hoje", bondRate(verdict.type, verdict.rate)],
    ["Preço do título", verdict.unit_price && formatMoney(verdict.unit_price)],
    ["Quantidade", verdict.quantity && formatNumber(verdict.quantity)],
    ["Custo evitado ao amortizar", verdict.avoided_cost && formatMoney(verdict.avoided_cost)],
  ].filter((row): row is [string, string] => Boolean(row[1]));
  const note = breakEvenNote(verdict);
  return (
    <GroupedListSection aria-labelledby={headerId}>
      <GroupedListHeader id={headerId}>Detalhes</GroupedListHeader>
      <GroupedList>
        {rows.map(([label, value]) => (
          <GroupedListItem key={label}>
            <GroupedListRow>
              <GroupedListLabel>{label}</GroupedListLabel>
              <GroupedListValue>{value}</GroupedListValue>
            </GroupedListRow>
          </GroupedListItem>
        ))}
      </GroupedList>
      {note && <p className="px-4 text-footnote text-muted-foreground">{note}</p>}
      <ScenariosPrototype
        cards
        scenarios={[
          { title: "Investir", scenario: verdict.invest },
          { title: "Amortizar", scenario: verdict.prepay },
        ]}
      />
    </GroupedListSection>
  );
}

interface ComparisonProps {
  decision: Decision;
  /** Puts the amount in the sentence and compares it. */
  onUseAmount: (amount: string) => void;
}

/**
 * Comparison shows a decision: the compared bonds as tabs on the verdict panel, the one of the
 * highest Advantage open first, and the details of the one open. The bonds it couldn't compare
 * follow. A decision that compares no bond says why instead.
 */
export function Comparison({ decision, onUseAmount }: ComparisonProps) {
  const { compared, unavailable } = rankVerdicts(decision.verdicts);
  const [selectedKey, setSelectedKey] = useState<string>();
  const selected = compared.find((v) => verdictKey(v) === selectedKey) ?? compared[0];

  if (!selected) {
    return (
      <div className="flex flex-col gap-2">
        {noComparisons(decision).map((why) => (
          <NoComparisonPanel key={why.reason} why={why} onUseAmount={onUseAmount} />
        ))}
        {decision.verdicts[0] && <StaleNote marketData={decision.verdicts[0].market_data} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <VerdictPanel
          verdicts={compared}
          selected={selected}
          onSelect={(verdict) => setSelectedKey(verdictKey(verdict))}
          amount={decision.amount}
          date={decision.date}
        />
        <StaleNote marketData={selected.market_data} />
      </div>
      <Details verdict={selected} />
      <UncomparedBonds verdicts={unavailable} onUseAmount={onUseAmount} />
      <p className="text-center text-footnote text-muted-foreground">
        {selected.projected_by.length === 0
          ? "Somente valores publicados."
          : `Na projeção atual: ${projectedByText(selected.projected_by)}.`}{" "}
        O DebtWise compara; a decisão é sua.
      </p>
    </div>
  );
}
