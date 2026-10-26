import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { SelectField, TextField } from "@/components/mortgage/FormControls";
import { ContractRateRows, FeeRows, MonthlyRateRows } from "@/components/mortgage/RowLists";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError, type RegisteredMortgage } from "@/lib/api";
import {
  type AmortizationSystem,
  amortizationSystemLabels,
  emptyValues,
  type FormValues,
  type Indexer,
  indexerLabels,
  invalidLocations,
  termsFromValues,
  valuesFromMortgage,
} from "@/lib/mortgageForm";
import { useMortgage, useSaveMortgage } from "@/lib/mortgageQueries";

const systemOptions = (
  Object.entries(amortizationSystemLabels) as [AmortizationSystem, string][]
).map(([value, label]) => ({ value, label }));

const indexerOptions = (Object.entries(indexerLabels) as [Indexer, string][]).map(
  ([value, label]) => ({ value, label }),
);

type ListName = "contractRates" | "mipRates" | "dfiRates" | "fees";

function MortgageFormFields({ mortgage }: { mortgage: RegisteredMortgage | null }) {
  const [values, setValues] = useState<FormValues>(() =>
    mortgage ? valuesFromMortgage(mortgage) : emptyValues(),
  );
  const save = useSaveMortgage();
  const navigate = useNavigate();
  const invalid = invalidLocations(save.error);
  const isInvalid = (location: string) => invalid.has(location);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));
  // The API names rows by position, so once a row is added or removed its answer is out of date.
  const setRows = <L extends ListName>(list: L, rows: FormValues[L]) => {
    if (rows.length !== values[list].length) save.reset();
    set(list, rows);
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate(termsFromValues(values), { onSuccess: () => navigate({ to: "/financiamento" }) });
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold">
        {mortgage ? "Editar financiamento" : "Cadastrar financiamento"}
      </h2>
      {save.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {save.error instanceof ApiError && save.error.status === 422
              ? "Não foi possível salvar. Verifique os campos destacados."
              : "Não foi possível salvar o financiamento."}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Data do contrato"
          type="date"
          value={values.contractDate}
          onChange={(value) => set("contractDate", value)}
          invalid={isInvalid("contract_date")}
        />
        <TextField
          label="Valor financiado"
          inputMode="decimal"
          value={values.originalAmount}
          onChange={(value) => set("originalAmount", value)}
          invalid={isInvalid("original_amount")}
        />
        <TextField
          label="Prazo (meses)"
          type="number"
          inputMode="numeric"
          value={values.termMonths}
          onChange={(value) => set("termMonths", value)}
          invalid={isInvalid("term_months")}
        />
        <TextField
          label="Primeira prestação"
          type="date"
          value={values.firstInstallmentDate}
          onChange={(value) => set("firstInstallmentDate", value)}
          invalid={isInvalid("first_installment_date")}
        />
        <SelectField
          label="Sistema de amortização"
          options={systemOptions}
          value={values.amortizationSystem}
          onChange={(value) => set("amortizationSystem", value)}
          invalid={isInvalid("amortization_system")}
        />
        <SelectField
          label="Indexador"
          options={indexerOptions}
          value={values.indexer}
          onChange={(value) => set("indexer", value)}
          invalid={isInvalid("indexer")}
        />
        <TextField
          label="Valor de avaliação"
          inputMode="decimal"
          value={values.appraisalValue}
          onChange={(value) => set("appraisalValue", value)}
          invalid={isInvalid("appraisal_value")}
        />
      </div>

      <ContractRateRows
        rows={values.contractRates}
        onChange={(rows) => setRows("contractRates", rows)}
        isInvalid={isInvalid}
      />
      <MonthlyRateRows
        insurance="MIP"
        rows={values.mipRates}
        onChange={(rows) => setRows("mipRates", rows)}
        isInvalid={isInvalid}
      />
      <MonthlyRateRows
        insurance="DFI"
        rows={values.dfiRates}
        onChange={(rows) => setRows("dfiRates", rows)}
        isInvalid={isInvalid}
      />
      <FeeRows
        rows={values.fees}
        onChange={(rows) => setRows("fees", rows)}
        isInvalid={isInvalid}
      />

      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          Salvar
        </Button>
        <Button asChild variant="outline">
          <Link to="/financiamento">Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}

export function MortgageForm() {
  const { data, isPending, isError } = useMortgage();

  if (isPending) return <p>Carregando financiamento…</p>;
  if (isError) return <p>Não foi possível carregar o financiamento.</p>;
  return <MortgageFormFields mortgage={data} />;
}
