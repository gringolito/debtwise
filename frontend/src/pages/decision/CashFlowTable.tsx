import { ProjectionCell } from "@/components/lots/LotValuesTables";
import { IndexCell } from "@/components/mortgage/MortgageSchedule";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CashFlow, LotAmount } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";

const NONE = "—";

const columns = [
  "Data",
  "Nº",
  "Índice",
  "Correção",
  "Juros",
  "Amortização",
  "MIP",
  "DFI",
  "Taxa adm.",
  "Prestação",
  "Investido",
  "Amortização extraordinária",
  "Caixa retido",
  "Pagamento do título",
  "Bruto",
  "IOF",
  "IR",
  "Taxa de custódia",
  "Líquido",
  "Projeção",
  "Saldo devedor",
];

function MoneyCell({ value }: { value: string | undefined }) {
  return <TableCell>{value === undefined ? NONE : formatMoney(value)}</TableCell>;
}

/** bondPayment is what the bond paid on a date: a coupon before maturity, or its redemption. */
function bondPayment({
  coupon,
  redeemed,
}: CashFlow): { kind: string; amount: LotAmount } | undefined {
  if (coupon) return { kind: "Cupom", amount: coupon };
  if (redeemed) return { kind: "Resgate", amount: redeemed };
  return undefined;
}

function CashFlowRow({ flow }: { flow: CashFlow }) {
  const { installment } = flow;
  const payment = bondPayment(flow);
  return (
    <TableRow>
      <TableCell>{formatDate(flow.date)}</TableCell>
      <TableCell>{installment?.number ?? NONE}</TableCell>
      <TableCell>
        {installment ? <IndexCell indexValues={installment.index_values} /> : NONE}
      </TableCell>
      <MoneyCell value={installment?.correction} />
      <MoneyCell value={installment?.interest} />
      <MoneyCell value={installment?.amortization} />
      <MoneyCell value={installment?.mip} />
      <MoneyCell value={installment?.dfi} />
      <MoneyCell value={installment?.fee} />
      <MoneyCell value={installment?.amount} />
      <MoneyCell value={flow.invested} />
      <MoneyCell value={flow.prepaid} />
      <MoneyCell value={flow.held} />
      <TableCell>{payment?.kind ?? NONE}</TableCell>
      <MoneyCell value={payment?.amount.gross} />
      <MoneyCell value={payment?.amount.iof} />
      <MoneyCell value={payment?.amount.income_tax} />
      <MoneyCell value={payment?.amount.custody_fee} />
      <MoneyCell value={payment?.amount.net} />
      <ProjectionCell methods={payment?.amount.projected_by ?? []} />
      <MoneyCell value={flow.outstanding_balance} />
    </TableRow>
  );
}

/** CashFlowTable lists the flows of one scenario by date: the installment, the bond and the balance. */
export function CashFlowTable({ label, flows }: { label: string; flows: CashFlow[] }) {
  return (
    <Table aria-label={`Fluxo de caixa de ${label}`}>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column}>{column}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {flows.map((flow) => (
          <CashFlowRow key={flow.date} flow={flow} />
        ))}
      </TableBody>
    </Table>
  );
}
