// PROTOTYPE, throwaway: "Ver cenários" in "Orvalho nítido".
// - The horizon reads in words, without negative amounts: "No fim, você deve R$ 380.743,46". The
//   few reais held uninvested are left out.
// - A projected index reads as its value in grey; one plain sentence above the table says how and
//   from when it is projected, and a tooltip names each reading's period.
// - Columns with nothing in them for this scenario are left out.
import type { ReactNode } from "react";
import { AmountRow, AmountsHeader } from "@/components/lots/LotValuesTables";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type {
  CashFlow,
  CorrectionIndex,
  IndexName,
  LotAmount,
  ProjectionMethodName,
  Scenario,
} from "@/lib/api";
import { formatDate, formatMonth, formatMoney, formatPercent, formatPeriod } from "@/lib/format";
import { indexNames } from "@/lib/indexNames";

function bondPayment({
  sold,
  coupon,
  redeemed,
}: CashFlow): { kind: string; amount: LotAmount } | undefined {
  if (sold) return { kind: "Venda", amount: sold };
  if (coupon) return { kind: "Cupom", amount: coupon };
  if (redeemed) return { kind: "Resgate", amount: redeemed };
  return undefined;
}

const projectedIndex: Record<IndexName, string> = {
  tr: "Taxa TR projetada",
  poupanca_yield: "Remuneração da poupança projetada",
  selic_target: "Selic meta projetada",
  selic: "Selic diária projetada",
  ipca: "IPCA projetado",
  ipca_number: "IPCA projetado",
};

const byMethod: Record<ProjectionMethodName, string> = {
  trailing_12: "pela média dos últimos 12 meses",
  trailing_60: "pela média dos últimos 60 meses",
  focus: "pela mediana do Focus (BCB)",
};

function methodOf(value: CorrectionIndex): ProjectionMethodName | undefined {
  return (value.methods.find((m) => m.index === value.index) ?? value.methods[0])?.method;
}

function period({ index, period_start, period_end }: CorrectionIndex): string {
  if (index === "selic_target") return formatDate(period_start);
  return index === "ipca" ? formatMonth(period_start) : formatPeriod(period_start, period_end);
}

function IndexValue({ value }: { value: CorrectionIndex }) {
  const text = `${indexNames[value.index]} ${value.value ? formatPercent(value.value) : "sem índice"}`;
  if (value.status !== "projected") return <span>{text}</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="rounded-sm text-muted-foreground underline decoration-dotted underline-offset-4"
        >
          {text}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <span>
          {projectedIndex[value.index]} {byMethod[methodOf(value) ?? "trailing_12"]} no período de{" "}
          {period(value)}.
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

const money = (value: string | undefined) => (value === undefined ? undefined : formatMoney(value));

const columns: { label: string; cell: (flow: CashFlow) => ReactNode | undefined }[] = [
  { label: "Nº", cell: (f) => f.installment?.number },
  {
    label: "Índice",
    cell: (f) =>
      f.installment && f.installment.index_values.length > 0
        ? f.installment.index_values.map((v) => (
            <IndexValue key={`${v.index}-${v.period_start}`} value={v} />
          ))
        : undefined,
  },
  { label: "Correção", cell: (f) => money(f.installment?.correction) },
  { label: "Juros", cell: (f) => money(f.installment?.interest) },
  { label: "Amortização", cell: (f) => money(f.installment?.amortization) },
  { label: "MIP", cell: (f) => money(f.installment?.mip) },
  { label: "DFI", cell: (f) => money(f.installment?.dfi) },
  { label: "Taxa adm.", cell: (f) => money(f.installment?.fee) },
  { label: "Prestação", cell: (f) => money(f.installment?.amount) },
  { label: "Investido", cell: (f) => money(f.invested) },
  { label: "Amortização extraordinária", cell: (f) => money(f.prepaid) },
  { label: "Caixa retido", cell: (f) => money(f.held) },
  { label: "Pagamento do título", cell: (f) => bondPayment(f)?.kind },
  { label: "Bruto", cell: (f) => money(bondPayment(f)?.amount.gross) },
  { label: "IOF", cell: (f) => money(bondPayment(f)?.amount.iof) },
  { label: "IR", cell: (f) => money(bondPayment(f)?.amount.income_tax) },
  { label: "Taxa de custódia", cell: (f) => money(bondPayment(f)?.amount.custody_fee) },
  { label: "Líquido", cell: (f) => money(bondPayment(f)?.amount.net) },
  { label: "Saldo devedor", cell: (f) => money(f.outstanding_balance) },
];

const ZERO = /^R\$\s0,00$/;

function ProtoCashFlowTable({ label, flows }: { label: string; flows: CashFlow[] }) {
  // A column shows when some flow has something in it other than zero.
  const shown = columns.filter(({ cell }) =>
    flows.some((flow) => {
      const value = cell(flow);
      return value !== undefined && !(typeof value === "string" && ZERO.test(value));
    }),
  );
  // The first projected reading of each index, which says from when its projection runs.
  const projected = new Map<IndexName, CorrectionIndex>();
  for (const flow of flows) {
    for (const value of flow.installment?.index_values ?? []) {
      if (value.status === "projected" && !projected.has(value.index))
        projected.set(value.index, value);
    }
  }
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-2">
        {projected.size > 0 && (
          <div className="text-footnote text-muted-foreground">
            {[...projected.values()].map((value) => (
              <p key={value.index}>
                {projectedIndex[value.index]} {byMethod[methodOf(value) ?? "trailing_12"]} a partir
                de {formatDate(value.period_start)}.
              </p>
            ))}
            <p>Os valores projetados aparecem em cinza.</p>
          </div>
        )}
        <Table aria-label={`Fluxo de caixa de ${label}`}>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              {shown.map(({ label: column }) => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {flows.map((flow) => (
              <TableRow key={flow.date}>
                <TableCell>{formatDate(flow.date)}</TableCell>
                {shown.map(({ label: column, cell }) => (
                  <TableCell key={column}>{cell(flow) ?? "—"}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}

function standing(netWorth: string): string {
  return netWorth.startsWith("-")
    ? `Você deve ${formatMoney(netWorth.slice(1))}`
    : `Você tem ${formatMoney(netWorth)}`;
}

export function ProtoScenarioDetails({ title, scenario }: { title: string; scenario: Scenario }) {
  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <h4 className="font-medium">{title}</h4>
      <dl className="flex flex-col gap-1 text-callout">
        <div className="flex justify-between gap-4">
          <dt>No fim</dt>
          <dd className="font-semibold">{standing(scenario.net_worth)}</dd>
        </div>
        <div className="flex justify-between gap-4 text-muted-foreground">
          <dt>Saldo devedor</dt>
          <dd>{formatMoney(scenario.outstanding_balance)}</dd>
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
      <ProtoCashFlowTable label={title} flows={scenario.cash_flows} />
    </section>
  );
}
