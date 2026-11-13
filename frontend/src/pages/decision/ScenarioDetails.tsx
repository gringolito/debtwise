import { AmountRow, AmountsHeader } from "@/components/lots/LotValuesTables";
import { Table, TableBody } from "@/components/ui/table";
import type { Scenario } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { standing } from "@/lib/yardstick";
import { CashFlowTable } from "@/pages/decision/CashFlowTable";

/**
 * ScenarioDetails shows what a scenario leaves the owner with on the horizon, in words and with no
 * negative amount, and every cash flow on the way.
 */
export function ScenarioDetails({ title, scenario }: { title: string; scenario: Scenario }) {
  const { owes, amount } = standing(scenario);
  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <h3 className="text-headline">{title}</h3>
      <dl className="flex flex-col gap-1 text-callout">
        <div className="flex justify-between gap-4">
          <dt>No fim</dt>
          <dd className="font-semibold tabular-nums">{`${owes ? "Você deve" : "Você tem"} ${amount}`}</dd>
        </div>
        <div className="flex justify-between gap-4 text-muted-foreground">
          <dt>Saldo devedor</dt>
          <dd className="tabular-nums">{formatMoney(scenario.outstanding_balance)}</dd>
        </div>
      </dl>
      {scenario.bond && (
        <Table aria-label={`Valor no vencimento de ${title}`}>
          <AmountsHeader />
          <TableBody>
            <AmountRow name="Valor no vencimento" amount={scenario.bond} />
          </TableBody>
        </Table>
      )}
      <CashFlowTable label={title} flows={scenario.cash_flows} />
    </section>
  );
}
