import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  CashFlow,
  CorrectionIndex,
  IndexName,
  LotAmount,
  ProjectionMethodName,
} from "@/lib/api";
import { isZero } from "@/lib/decisions";
import { formatDate, formatMoney, formatMonth, formatPercent, formatPeriod } from "@/lib/format";
import { indexNames } from "@/lib/indexNames";
import { projectedByText } from "@/lib/projectionMethods";

const NONE = "—";

const projectedIndexes: Record<IndexName, string> = {
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

/** How a projected reading was projected: "Taxa TR projetada pela média dos últimos 12 meses". */
function projection({ index, methods }: CorrectionIndex): string {
  const method = (methods.find((m) => m.index === index) ?? methods[0])?.method;
  return method ? `${projectedIndexes[index]} ${byMethod[method]}` : projectedIndexes[index];
}

// TR runs from one day to the same day of the next month; IPCA is a calendar month, which the API
// sends as a single day; the Selic target is the one day it was set.
function period({ index, period_start, period_end }: CorrectionIndex): string {
  if (index === "selic_target") return formatDate(period_start);
  return index === "ipca" ? formatMonth(period_start) : formatPeriod(period_start, period_end);
}

function startOf({ index, period_start }: CorrectionIndex): string {
  return index === "ipca" ? formatMonth(period_start) : formatDate(period_start);
}

/**
 * IndexValue is an index reading as its value. A projected one is grey, and opens, on a tap or the
 * keyboard, the period it was projected for.
 */
function IndexValue({ value }: { value: CorrectionIndex }) {
  const text = `${indexNames[value.index]} ${value.value ? formatPercent(value.value) : "sem índice"}`;
  if (value.status !== "projected") return <div>{text}</div>;
  return (
    <div>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="rounded-lg text-muted-foreground underline decoration-dotted underline-offset-4"
          >
            {text}
          </button>
        </PopoverTrigger>
        <PopoverContent>{`${projection(value)} no período de ${period(value)}.`}</PopoverContent>
      </Popover>
    </div>
  );
}

/** bondPayment is what the bond paid on a date: a lot's sale, a coupon before maturity, or its redemption. */
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

/** A column of the table: whether a flow has something in it, and what it shows there. */
interface Column {
  label: string;
  filled: (flow: CashFlow) => boolean;
  cell: (flow: CashFlow) => ReactNode;
}

/** money is a column of an amount, which a flow without one leaves empty and zero leaves blank. */
function money(label: string, pick: (flow: CashFlow) => string | undefined): Column {
  return {
    label,
    filled: (flow) => {
      const value = pick(flow);
      return value !== undefined && !isZero(value);
    },
    cell: (flow) => {
      const value = pick(flow);
      return value === undefined ? NONE : formatMoney(value);
    },
  };
}

const columns: Column[] = [
  {
    label: "Nº",
    filled: (flow) => flow.installment !== undefined,
    cell: (flow) => flow.installment?.number ?? NONE,
  },
  {
    label: "Índice",
    filled: (flow) => (flow.installment?.index_values.length ?? 0) > 0,
    cell: (flow) => {
      const values = flow.installment?.index_values ?? [];
      if (values.length === 0) return NONE;
      return values.map((value) => (
        <IndexValue key={`${value.index}-${value.period_start}`} value={value} />
      ));
    },
  },
  money("Correção", (flow) => flow.installment?.correction),
  money("Juros", (flow) => flow.installment?.interest),
  money("Amortização", (flow) => flow.installment?.amortization),
  money("MIP", (flow) => flow.installment?.mip),
  money("DFI", (flow) => flow.installment?.dfi),
  money("Taxa adm.", (flow) => flow.installment?.fee),
  money("Prestação", (flow) => flow.installment?.amount),
  money("Investido", (flow) => flow.invested),
  money("Amortização extraordinária", (flow) => flow.prepaid),
  {
    label: "Pagamento do título",
    filled: (flow) => bondPayment(flow) !== undefined,
    cell: (flow) => bondPayment(flow)?.kind ?? NONE,
  },
  money("Bruto", (flow) => bondPayment(flow)?.amount.gross),
  money("IOF", (flow) => bondPayment(flow)?.amount.iof),
  money("IR", (flow) => bondPayment(flow)?.amount.income_tax),
  money("Taxa de custódia", (flow) => bondPayment(flow)?.amount.custody_fee),
  money("Líquido", (flow) => bondPayment(flow)?.amount.net),
  {
    label: "Projeção",
    filled: (flow) => (bondPayment(flow)?.amount.projected_by.length ?? 0) > 0,
    cell: (flow) => {
      const methods = bondPayment(flow)?.amount.projected_by ?? [];
      if (methods.length === 0) return NONE;
      return (
        <>
          <Badge variant="secondary">Projetado</Badge>
          <span className="block text-footnote text-muted-foreground">
            {projectedByText(methods)}
          </span>
        </>
      );
    },
  },
  money("Saldo devedor", (flow) => flow.outstanding_balance),
];

/** The first projected reading of each index, which says from when its projection runs. */
function firstProjected(flows: CashFlow[]): CorrectionIndex[] {
  const first = new Map<IndexName, CorrectionIndex>();
  for (const flow of flows) {
    for (const value of flow.installment?.index_values ?? []) {
      if (value.status === "projected" && !first.has(value.index)) first.set(value.index, value);
    }
  }
  return [...first.values()];
}

/**
 * CashFlowTable lists the flows of one scenario by date: the installment, the bond and the balance.
 * A column with nothing in it, or only zero, for the whole scenario is left out.
 */
export function CashFlowTable({ label, flows }: { label: string; flows: CashFlow[] }) {
  const shown = columns.filter((column) => flows.some(column.filled));
  const projected = firstProjected(flows);
  return (
    <div className="flex flex-col gap-2">
      {projected.length > 0 && (
        <div className="text-footnote text-muted-foreground">
          {projected.map((value) => (
            <p key={value.index}>{`${projection(value)} a partir de ${startOf(value)}.`}</p>
          ))}
          <p>Os valores projetados aparecem em cinza.</p>
        </div>
      )}
      <Table aria-label={`Fluxo de caixa de ${label}`}>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            {shown.map((column) => (
              <TableHead key={column.label}>{column.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {flows.map((flow) => (
            <TableRow key={flow.date}>
              <TableCell>{formatDate(flow.date)}</TableCell>
              {shown.map((column) => (
                <TableCell key={column.label}>{column.cell(flow)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
