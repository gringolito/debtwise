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
import { formatDate, formatMoney } from "@/lib/ptbr";

const columns = [
  "Nº",
  "Vencimento",
  "Juros",
  "Amortização",
  "MIP",
  "DFI",
  "Tarifa",
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
        {data.months.map((month) => (
          <TableRow key={month.number}>
            <TableCell>{month.number}</TableCell>
            <TableCell>{formatDate(month.due_date)}</TableCell>
            <TableCell>{formatMoney(month.interest)}</TableCell>
            <TableCell>{formatMoney(month.amortization)}</TableCell>
            <TableCell>{formatMoney(month.mip)}</TableCell>
            <TableCell>{formatMoney(month.dfi)}</TableCell>
            <TableCell>{formatMoney(month.fee)}</TableCell>
            <TableCell>{formatMoney(month.installment)}</TableCell>
            <TableCell>{formatMoney(month.outstanding_balance)}</TableCell>
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
