import { ChevronRightIcon } from "lucide-react";
import { Drift } from "@/components/mortgage/Drift";
import { ErrorPanel } from "@/components/patterns/ErrorPanel";
import { Loading } from "@/components/patterns/Loading";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StatementDrift } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { useStatements } from "@/lib/mortgageQueries";

const columns = ["Data", "Saldo do banco", "Saldo calculado", "Diferença"];

function StatementTable({
  statements,
  onEdit,
}: {
  statements: StatementDrift[];
  onEdit: (statement: StatementDrift) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card px-2">
      <Table aria-label="Extratos registrados">
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column}>
                <span className="text-footnote tracking-wide text-muted-foreground uppercase">
                  {column}
                </span>
              </TableHead>
            ))}
            <TableHead>
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {statements.map((statement) => (
            <TableRow key={statement.id}>
              <TableCell>{formatDate(statement.date)}</TableCell>
              <TableCell>{formatMoney(statement.outstanding_balance)}</TableCell>
              <TableCell>
                <span className="text-muted-foreground">
                  {formatMoney(statement.computed_balance)}
                </span>
              </TableCell>
              <TableCell>
                <Drift amount={statement.drift} withinRounding={statement.within_rounding} />
              </TableCell>
              <TableCell className="w-10">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Editar extrato de ${formatDate(statement.date)}`}
                  onClick={() => onEdit(statement)}
                >
                  <ChevronRightIcon aria-hidden="true" strokeWidth={1.5} />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface StatementsProps {
  onEdit: (statement: StatementDrift) => void;
}

/** Statements compares each statement's balance with the schedule's, each one opening to edit it. */
export function Statements({ onEdit }: StatementsProps) {
  const { data, isPending, isError, refetch } = useStatements();

  if (isPending) {
    return (
      <Loading label="Carregando extratos">
        <Skeleton className="h-48" />
      </Loading>
    );
  }
  if (isError) {
    return (
      <ErrorPanel title="Não foi possível carregar os extratos" onRetry={() => void refetch()} />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-callout text-muted-foreground">
        Compare o saldo do extrato do banco com o calculado. A partir de cada extrato, o DebtWise
        usa o saldo do banco.
      </p>
      {data.statements.length === 0 ? (
        <p className="rounded-lg border bg-card px-6 py-10 text-center text-callout text-muted-foreground">
          Nenhum extrato registrado.
        </p>
      ) : (
        <>
          <StatementTable statements={data.statements.toReversed()} onEdit={onEdit} />
          <p className="px-1 text-footnote text-muted-foreground">
            Diferenças de alguns centavos são arredondamento. Diferenças maiores podem indicar uma
            taxa ou seguro desatualizado.
          </p>
        </>
      )}
    </div>
  );
}
