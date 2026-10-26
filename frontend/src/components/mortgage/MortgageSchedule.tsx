import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMortgageSchedule } from "@/lib/mortgageQueries";
import { formatDate, formatMoney } from "@/lib/format";

const columns = [
  "Nº",
  "Vencimento",
  "Juros",
  "Amortização",
  "MIP",
  "DFI",
  "Taxa adm.",
  "Prestação",
  "Saldo devedor",
];

function ScheduleTable() {
  const { data, isPending, isError } = useMortgageSchedule();

  if (isPending) return <p>Carregando evolução…</p>;
  if (isError) return <p>Não foi possível carregar a evolução do financiamento.</p>;
  return (
    <Table aria-label="Evolução do financiamento">
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column}>{column}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.installments.map((installment) => (
          <TableRow key={installment.number}>
            <TableCell>{installment.number}</TableCell>
            <TableCell>{formatDate(installment.due_date)}</TableCell>
            <TableCell>{formatMoney(installment.interest)}</TableCell>
            <TableCell>{formatMoney(installment.amortization)}</TableCell>
            <TableCell>{formatMoney(installment.mip)}</TableCell>
            <TableCell>{formatMoney(installment.dfi)}</TableCell>
            <TableCell>{formatMoney(installment.fee)}</TableCell>
            <TableCell>{formatMoney(installment.amount)}</TableCell>
            <TableCell>{formatMoney(installment.outstanding_balance)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function MortgageSchedule() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Evolução do financiamento</CardTitle>
      </CardHeader>
      <CardContent>
        <ScheduleTable />
      </CardContent>
    </Card>
  );
}
