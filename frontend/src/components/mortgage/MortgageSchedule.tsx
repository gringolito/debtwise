import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CorrectionIndex } from "@/lib/api";
import { useMortgageSchedule } from "@/lib/mortgageQueries";
import { formatDate, formatMoney, formatMonth, formatPercent, formatPeriod } from "@/lib/format";
import { indexNames } from "@/lib/indexNames";
import { projectionMethodLabels } from "@/lib/projectionMethods";

const columns = [
  "Nº",
  "Vencimento",
  "Índice",
  "Correção",
  "Juros",
  "Amortização",
  "MIP",
  "DFI",
  "Taxa adm.",
  "Prestação",
  "Amortização extraordinária",
  "Saldo devedor",
];

// TR and the poupança yield run from one day to the same day of the next month; IPCA is a
// calendar month, which the API sends as a single day.
function indexPeriod({ index, period_start, period_end }: CorrectionIndex): string {
  return index === "ipca" ? formatMonth(period_start) : formatPeriod(period_start, period_end);
}

function methodsText({ methods }: CorrectionIndex): string {
  return methods
    .map(({ index, method }) => `${indexNames[index]}: ${projectionMethodLabels[method]}`)
    .join("; ");
}

function IndexCell({ indexValues }: { indexValues: CorrectionIndex[] }) {
  if (indexValues.length === 0) return <>—</>;
  return (
    <>
      {indexValues.map((index) => (
        <div key={`${index.index}-${index.period_start}`}>
          <span>{indexNames[index.index]}</span>{" "}
          {index.status === "missing" ? (
            <Badge variant="outline">Sem índice</Badge>
          ) : (
            <span>{index.value && formatPercent(index.value)}</span>
          )}{" "}
          {index.status === "projected" && <Badge variant="secondary">Projetado</Badge>}{" "}
          <span className="block text-xs text-muted-foreground">{indexPeriod(index)}</span>{" "}
          {index.status === "projected" && (
            <span className="block text-xs text-muted-foreground">{methodsText(index)}</span>
          )}
        </div>
      ))}
    </>
  );
}

function MissingIndexWarning({ missing }: { missing: CorrectionIndex[] }) {
  if (missing.length === 0) return null;
  const months =
    missing.length === 1
      ? "1 mês. Esse mês não foi corrigido."
      : `${missing.length} meses. Esses meses não foram corrigidos.`;
  return (
    <Alert variant="warning">
      <AlertDescription>
        Faltam valores de {indexNames[missing[0].index]} para {months} Atualize os dados de mercado
        na página{" "}
        <Link to="/indices" className="underline">
          Índices
        </Link>
        .
      </AlertDescription>
    </Alert>
  );
}

function ScheduleTable() {
  const { data, isPending, isError } = useMortgageSchedule();

  if (isPending) return <p>Carregando evolução…</p>;
  if (isError) return <p>Não foi possível carregar a evolução do financiamento.</p>;
  return (
    <div className="flex flex-col gap-4">
      <MissingIndexWarning
        missing={data.installments.flatMap((installment) =>
          installment.index_values.filter((value) => value.status === "missing"),
        )}
      />
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
              <TableCell>
                <IndexCell indexValues={installment.index_values} />
              </TableCell>
              <TableCell>{formatMoney(installment.correction)}</TableCell>
              <TableCell>{formatMoney(installment.interest)}</TableCell>
              <TableCell>{formatMoney(installment.amortization)}</TableCell>
              <TableCell>{formatMoney(installment.mip)}</TableCell>
              <TableCell>{formatMoney(installment.dfi)}</TableCell>
              <TableCell>{formatMoney(installment.fee)}</TableCell>
              <TableCell>{formatMoney(installment.amount)}</TableCell>
              <TableCell>{formatMoney(installment.prepaid)}</TableCell>
              <TableCell>{formatMoney(installment.outstanding_balance)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
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
