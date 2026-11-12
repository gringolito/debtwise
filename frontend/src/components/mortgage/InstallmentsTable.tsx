import { Link } from "@tanstack/react-router";
import { ChevronDownIcon, ChevronRightIcon, InfoIcon } from "lucide-react";
import { useState } from "react";
import { IndexCell } from "@/components/mortgage/IndexValues";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { CorrectionIndex, ScheduledInstallment } from "@/lib/api";
import { formatDate, formatMoney, formatRate } from "@/lib/format";
import { indexNames } from "@/lib/indexNames";
import { isZero } from "@/lib/decisions";

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
        em{" "}
        <Link to="/ajustes" className="underline">
          Ajustes
        </Link>
        .
      </AlertDescription>
    </Alert>
  );
}

function MissingRateWarning({ missing }: { missing: CorrectionIndex[] }) {
  if (missing.length === 0) return null;
  const months =
    missing.length === 1
      ? "1 mês. A taxa de juros desse mês não inclui o adicional da poupança."
      : `${missing.length} meses. A taxa de juros desses meses não inclui o adicional da poupança.`;
  return (
    <Alert variant="warning">
      <AlertDescription>
        Faltam valores de {indexNames[missing[0].index]} para {months} Atualize os dados de mercado
        em{" "}
        <Link to="/ajustes" className="underline">
          Ajustes
        </Link>
        .
      </AlertDescription>
    </Alert>
  );
}

// The spaces keep the text readable when copied or read out as one line.
function Detail({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt>{name}</dt>{" "}
      <dd className="flex items-center gap-1.5 text-callout text-foreground">{children}</dd>{" "}
    </div>
  );
}

/** Readings opens, under an info icon, the index readings a figure of the installment comes from. */
function Readings({ label, indexValues }: { label: string; indexValues: CorrectionIndex[] }) {
  if (indexValues.length === 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={label} className="rounded-full text-accent">
          <InfoIcon aria-hidden="true" strokeWidth={1.5} className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <div className="flex flex-col gap-2">
          <IndexCell indexValues={indexValues} />
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function InstallmentDetails({ installment }: { installment: ScheduledInstallment }) {
  return (
    <TooltipProvider>
      <dl className="flex flex-wrap gap-x-10 gap-y-4 px-2 py-1 text-footnote text-muted-foreground">
        <Detail name="Correção">
          {formatMoney(installment.correction)}
          <Readings label="Índices da correção" indexValues={installment.index_values} />
        </Detail>
        <Detail name="Taxa de juros">
          {formatRate(installment.rate)} a.a.
          <Readings label="Índices da taxa de juros" indexValues={installment.rate_index_values} />
        </Detail>
        <Detail name="MIP">{formatMoney(installment.mip)}</Detail>
        <Detail name="DFI">{formatMoney(installment.dfi)}</Detail>
        <Detail name="Taxa de administração">{formatMoney(installment.fee)}</Detail>
        {!isZero(installment.prepaid) && (
          <Detail name="Amortização extraordinária">{formatMoney(installment.prepaid)}</Detail>
        )}
      </dl>
    </TooltipProvider>
  );
}

function InstallmentRow({
  installment,
  isCurrent,
}: {
  installment: ScheduledInstallment;
  isCurrent: boolean;
}) {
  const [expanded, setExpanded] = useState(isCurrent);
  const Chevron = expanded ? ChevronDownIcon : ChevronRightIcon;
  const detailsId = `installment-${installment.number}-details`;
  return (
    <>
      <TableRow aria-current={isCurrent ? "date" : undefined}>
        <TableCell>
          <span className="flex flex-col items-start gap-1">
            {installment.number}{" "}
            {isCurrent && (
              <span className="rounded-lg bg-card px-2 text-footnote text-accent">Atual</span>
            )}
          </span>
        </TableCell>
        <TableCell>{formatDate(installment.due_date)}</TableCell>
        <TableCell className="text-right">{formatMoney(installment.amount)}</TableCell>
        <TableCell className="text-right">
          <span className="text-muted-foreground">{formatMoney(installment.interest)}</span>
        </TableCell>
        <TableCell className="text-right">
          <span className="text-muted-foreground">{formatMoney(installment.amortization)}</span>
        </TableCell>
        <TableCell className="text-right">{formatMoney(installment.outstanding_balance)}</TableCell>
        <TableCell className="w-10">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-expanded={expanded}
            aria-controls={expanded ? detailsId : undefined}
            aria-label={`Detalhes da prestação ${installment.number}`}
            onClick={() => setExpanded(!expanded)}
          >
            <Chevron aria-hidden="true" strokeWidth={1.5} />
          </Button>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow id={detailsId} aria-current={isCurrent ? "date" : undefined}>
          <TableCell colSpan={7}>
            <InstallmentDetails installment={installment} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

const WINDOW_BEFORE = 2;
const WINDOW_SIZE = 6;

// The rows around the current installment, or the last ones once the schedule is paid off.
function windowAround(installments: ScheduledInstallment[], current?: ScheduledInstallment) {
  const at = current ? installments.indexOf(current) : installments.length;
  const start = Math.max(0, Math.min(at - WINDOW_BEFORE, installments.length - WINDOW_SIZE));
  return installments.slice(start, start + WINDOW_SIZE);
}

interface InstallmentsTableProps {
  installments: ScheduledInstallment[];
  current?: ScheduledInstallment;
}

/** InstallmentsTable shows the installments around the current one, and every one on request. */
export function InstallmentsTable({ installments, current }: InstallmentsTableProps) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? installments : windowAround(installments, current);
  return (
    <div className="flex flex-col gap-4">
      <MissingIndexWarning
        missing={installments.flatMap((installment) =>
          installment.index_values.filter((value) => value.status === "missing"),
        )}
      />
      <MissingRateWarning
        missing={installments.flatMap((installment) =>
          installment.rate_index_values.filter((value) => value.status === "missing"),
        )}
      />
      <div className="overflow-hidden rounded-lg glass px-2">
        <Table aria-label="Prestações">
          <TableHeader>
            <TableRow>
              {["Nº", "Vencimento"].map((column) => (
                <TableHead key={column}>
                  <span className="text-footnote tracking-wide text-muted-foreground uppercase">
                    {column}
                  </span>
                </TableHead>
              ))}
              {["Prestação", "Juros", "Amortização", "Saldo após"].map((column) => (
                <TableHead key={column} className="text-right">
                  <span className="text-footnote tracking-wide text-muted-foreground uppercase">
                    {column}
                  </span>
                </TableHead>
              ))}
              <TableHead>
                <span className="sr-only">Detalhes</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((installment) => (
              <InstallmentRow
                key={`${installment.number}-${installment === current}`}
                installment={installment}
                isCurrent={installment === current}
              />
            ))}
          </TableBody>
        </Table>
      </div>
      {installments.length > WINDOW_SIZE && (
        <Button variant="link" className="self-center" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Ver menos prestações" : `Ver todas as ${installments.length} prestações`}
        </Button>
      )}
    </div>
  );
}
