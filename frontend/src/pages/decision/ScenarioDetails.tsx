import { AmountRow, AmountsHeader } from "@/components/lots/LotValuesTables";
import { Table, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import type { Scenario } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { CashFlowTable } from "@/pages/decision/CashFlowTable";

function SummaryRow({ name, value }: { name: string; value: string }) {
  return (
    <TableRow>
      <TableHead scope="row">{name}</TableHead>
      <TableCell>{formatMoney(value)}</TableCell>
    </TableRow>
  );
}

/** ScenarioDetails shows what a scenario ends with on the horizon and every cash flow on the way. */
export function ScenarioDetails({ title, scenario }: { title: string; scenario: Scenario }) {
  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <h4 className="font-medium">{title}</h4>
      <Table aria-label={`Resumo de ${title}`}>
        <TableBody>
          <SummaryRow name="Patrimônio líquido no horizonte" value={scenario.net_worth} />
          <SummaryRow name="Caixa retido no horizonte" value={scenario.cash} />
          <SummaryRow name="Saldo devedor no horizonte" value={scenario.outstanding_balance} />
        </TableBody>
      </Table>
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
