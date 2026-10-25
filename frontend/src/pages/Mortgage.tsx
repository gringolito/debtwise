import { Link } from "@tanstack/react-router";
import { type ReactNode, useId } from "react";
import { DeleteMortgageDialog } from "@/components/mortgage/DeleteMortgageDialog";
import { MortgageSchedule } from "@/components/mortgage/MortgageSchedule";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ContractRate, RegisteredMortgage } from "@/lib/api";
import { useDeleteMortgage, useMortgage } from "@/lib/mortgageQueries";
import { formatDate, formatMoney, formatRate } from "@/lib/ptbr";

const systemNames = { sac: "SAC", price: "Price" } as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <Card role="region" aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle id={titleId}>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Term({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{name}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ContractTerms({ mortgage }: { mortgage: RegisteredMortgage }) {
  return (
    <Section title="Condições do contrato">
      <dl className="flex flex-col gap-2">
        <Term name="Data do contrato">{formatDate(mortgage.contract_date)}</Term>
        <Term name="Valor financiado">{formatMoney(mortgage.original_amount)}</Term>
        <Term name="Prazo">{mortgage.term_months} meses</Term>
        <Term name="Primeira prestação">{formatDate(mortgage.first_installment_date)}</Term>
        <Term name="Sistema de amortização">{systemNames[mortgage.amortization_system]}</Term>
        <Term name="Valor de avaliação">{formatMoney(mortgage.appraisal_value)}</Term>
      </dl>
    </Section>
  );
}

function informedMark(rate: ContractRate, basis: ContractRate["basis"]): string {
  return rate.basis === basis ? "informada" : "calculada";
}

function ContractRates({ rates }: { rates: ContractRate[] }) {
  return (
    <Section title="Taxa de juros">
      <ul className="flex flex-col gap-2">
        {rates.map((rate) => (
          <li key={rate.effective_from} className="flex flex-wrap gap-x-4">
            <span className="text-muted-foreground">
              A partir de {formatDate(rate.effective_from)}
            </span>{" "}
            <span>
              Nominal: {formatRate(rate.nominal)} a.a. ({informedMark(rate, "nominal")})
            </span>{" "}
            <span>
              Efetiva: {formatRate(rate.effective)} a.a. ({informedMark(rate, "effective")})
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function EffectiveRows({
  title,
  rows,
}: {
  title: string;
  rows: { effective_from: string; value: string }[];
}) {
  return (
    <Section title={title}>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.effective_from} className="flex flex-wrap gap-x-4">
            <span className="text-muted-foreground">
              A partir de {formatDate(row.effective_from)}
            </span>{" "}
            <span>{row.value}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function monthly(rows: { effective_from: string; rate: string }[]) {
  return rows.map((row) => ({
    effective_from: row.effective_from,
    value: `${formatRate(row.rate)} a.m.`,
  }));
}

function MortgageDetails({ mortgage }: { mortgage: RegisteredMortgage }) {
  const remove = useDeleteMortgage();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Financiamento</h2>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/financiamento/editar">Editar</Link>
          </Button>
          <DeleteMortgageDialog onConfirm={() => remove.mutate()} />
        </div>
      </div>
      {remove.isError && (
        <Alert variant="destructive">
          <AlertDescription>Não foi possível excluir o financiamento.</AlertDescription>
        </Alert>
      )}
      <ContractTerms mortgage={mortgage} />
      <ContractRates rates={mortgage.contract_rates} />
      <EffectiveRows title="MIP" rows={monthly(mortgage.mip_rates)} />
      <EffectiveRows title="DFI" rows={monthly(mortgage.dfi_rates)} />
      <EffectiveRows
        title="Tarifa de administração"
        rows={mortgage.fees.map((fee) => ({
          effective_from: fee.effective_from,
          value: formatMoney(fee.amount),
        }))}
      />
      <MortgageSchedule />
    </div>
  );
}

export function Mortgage() {
  const { data, isPending, isError } = useMortgage();

  if (isPending) return <p>Carregando financiamento…</p>;
  if (isError) return <p>Não foi possível carregar o financiamento.</p>;
  if (data === null) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p>Nenhum financiamento cadastrado.</p>
        <Button asChild>
          <Link to="/financiamento/editar">Cadastrar financiamento</Link>
        </Button>
      </div>
    );
  }
  return <MortgageDetails mortgage={data} />;
}
