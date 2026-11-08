import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeftIcon, PlusIcon } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { Page, PageHeader, PageTitle } from "@/components/layout/Page";
import { ChoiceRow, InputRow } from "@/components/patterns/FieldRows";
import {
  GroupedList,
  GroupedListChevron,
  GroupedListHeader,
  GroupedListItem,
  GroupedListLabel,
  GroupedListRow,
  GroupedListSection,
  GroupedListValue,
} from "@/components/patterns/GroupedList";
import { SegmentedControl, SegmentedControlItem } from "@/components/patterns/SegmentedControl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError, type RegisteredMortgage } from "@/lib/api";
import { indexNames } from "@/lib/indexNames";
import {
  type AmortizationSystem,
  amortizationSystemLabels,
  type FormValues,
  type Indexer,
  rejections,
  termsFromValues,
  valuesFromMortgage,
  withFirstChargeRates,
} from "@/lib/mortgageForm";
import { useMortgage, useSaveMortgage } from "@/lib/mortgageQueries";
import { cn } from "@/lib/utils";
import { ChangeSheet } from "@/pages/contract/ChangeSheet";
import {
  apiNames,
  type ChangeList,
  inDateOrder,
  insuranceOf,
  rateValue,
  rowMessages,
  since,
  typedMoney,
  typedPercent,
} from "@/pages/contract/changes";
import { useChangeEditor } from "@/pages/contract/useChangeEditor";

const indexerChoices: { value: Indexer; label: string }[] = [
  { value: "tr", label: indexNames.tr },
  { value: "ipca", label: indexNames.ipca },
  { value: "none", label: "Nenhum" },
];

function ContractHeader({ children }: { children?: ReactNode }) {
  return (
    <PageHeader className="flex-col items-stretch gap-2">
      <Link
        to="/financiamento"
        aria-label="Voltar para Financiamento"
        className="inline-flex items-center gap-1 self-start text-callout text-accent"
      >
        <ChevronLeftIcon aria-hidden="true" strokeWidth={1.5} className="size-4" />
        Financiamento
      </Link>
      <div className="flex items-center justify-between gap-4">
        <PageTitle>Contrato</PageTitle>
        {children}
      </div>
    </PageHeader>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <GroupedListSection aria-labelledby={id}>
      <GroupedListHeader id={id}>{title}</GroupedListHeader>
      {children}
    </GroupedListSection>
  );
}

function ChangeRow({
  label,
  value,
  messages,
  onOpen,
}: {
  label: string;
  value: string;
  messages: string[];
  onOpen: () => void;
}) {
  const id = useId();
  return (
    <GroupedListItem>
      <GroupedListRow asChild>
        <button
          type="button"
          aria-label={`${label}, ${value}`}
          aria-describedby={messages.length > 0 ? id : undefined}
          onClick={onOpen}
        >
          <GroupedListLabel className="flex flex-col gap-0.5">
            <span>{label}</span>
            {messages.length > 0 && (
              <span id={id} className="text-footnote text-destructive">
                {messages.join(" ")}
              </span>
            )}
          </GroupedListLabel>
          <GroupedListValue>{value}</GroupedListValue>
          <GroupedListChevron />
        </button>
      </GroupedListRow>
    </GroupedListItem>
  );
}

function AddChange({ className, children, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="link"
      size="inline"
      className={cn("mx-4 self-start", className)}
      {...props}
    >
      <PlusIcon aria-hidden="true" />
      {children}
    </Button>
  );
}

function ListMessage({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("px-4 text-footnote text-destructive", className)} {...props} />;
}

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function ContractForm({ mortgage }: { mortgage: RegisteredMortgage }) {
  const [values, setValues] = useState(() => valuesFromMortgage(mortgage));
  const save = useSaveMortgage();
  const navigate = useNavigate();
  const messages = rejections(save.error);
  const messageAt = (location: string) => messages.get(location);
  // The API names rows by position, so once a row is added or removed its answer is out of date.
  const { open, add, sheet } = useChangeEditor({
    values,
    setValues,
    messageAt,
    onRowsMoved: save.reset,
  });

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((current) => withFirstChargeRates(current, { ...current, [key]: value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate(termsFromValues(values), { onSuccess: () => navigate({ to: "/financiamento" }) });
  }

  const listMessage = (list: ChangeList, prefix = "") => {
    const message = messageAt(apiNames[list]);
    return message && <ListMessage>{`${prefix}${message}`}</ListMessage>;
  };

  const rateRows = inDateOrder(values.contractRates);
  const insuranceRows = (["mipRates", "dfiRates"] as const).flatMap((list) =>
    inDateOrder(values[list]).map((entry) => ({ list, ...entry })),
  );
  const feeRows = inDateOrder(values.fees);

  return (
    <form noValidate onSubmit={submit}>
      <Page>
        <ContractHeader>
          <div className="flex items-center gap-6">
            <Button asChild variant="plain" size="inline">
              <Link to="/financiamento">Cancelar</Link>
            </Button>
            <Button type="submit" disabled={save.isPending}>
              Salvar
            </Button>
          </div>
        </ContractHeader>

        {save.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              {save.error instanceof ApiError && save.error.status === 422
                ? "Não foi possível salvar. Confira os campos destacados."
                : "Não foi possível salvar o contrato."}
            </AlertDescription>
          </Alert>
        )}

        <Section title="Contrato">
          <GroupedList>
            <InputRow
              label="Data do contrato"
              type="date"
              value={values.contractDate}
              onChange={(value) => set("contractDate", value)}
              message={messageAt("contract_date")}
            />
            <InputRow
              label="Valor financiado"
              grouped
              prefix="R$"
              inputMode="decimal"
              placeholder="0,00"
              value={values.originalAmount}
              onChange={(value) => set("originalAmount", value)}
              message={messageAt("original_amount")}
            />
            <InputRow
              label="Prazo"
              inputMode="numeric"
              className="w-16"
              suffix="meses"
              value={values.termMonths}
              onChange={(value) => set("termMonths", value)}
              message={messageAt("term_months")}
            />
            <InputRow
              label="Primeira prestação"
              type="date"
              value={values.firstInstallmentDate}
              onChange={(value) => set("firstInstallmentDate", value)}
              message={messageAt("first_installment_date")}
            />
            <InputRow
              label="Valor de avaliação"
              grouped
              prefix="R$"
              inputMode="decimal"
              placeholder="0,00"
              value={values.appraisalValue}
              onChange={(value) => set("appraisalValue", value)}
              message={messageAt("appraisal_value")}
            />
          </GroupedList>
        </Section>

        <Section title="Cálculo">
          <GroupedList>
            <ChoiceRow label="Sistema de amortização" message={messageAt("amortization_system")}>
              {(labelId, describedBy) => (
                <SegmentedControl<AmortizationSystem>
                  aria-labelledby={labelId}
                  aria-describedby={describedBy}
                  value={values.amortizationSystem}
                  onValueChange={(value) => set("amortizationSystem", value)}
                >
                  {(["sac", "price"] as const).map((system) => (
                    <SegmentedControlItem key={system} value={system}>
                      {amortizationSystemLabels[system]}
                    </SegmentedControlItem>
                  ))}
                </SegmentedControl>
              )}
            </ChoiceRow>
            <ChoiceRow label="Correção do saldo" message={messageAt("indexer")}>
              {(labelId, describedBy) => (
                <SegmentedControl<Indexer>
                  aria-labelledby={labelId}
                  aria-describedby={describedBy}
                  value={values.indexer}
                  onValueChange={(value) => set("indexer", value)}
                >
                  {indexerChoices.map(({ value, label }) => (
                    <SegmentedControlItem key={value} value={value}>
                      {label}
                    </SegmentedControlItem>
                  ))}
                </SegmentedControl>
              )}
            </ChoiceRow>
          </GroupedList>
        </Section>

        <Section title="Juros do contrato">
          {rateRows.length > 0 && (
            <GroupedList>
              {rateRows.map(({ row, index }) => (
                <ChangeRow
                  key={row.id}
                  label={capitalized(since(row))}
                  value={rateValue(row)}
                  messages={rowMessages(messages, "contractRates", index)}
                  onOpen={() => open("contractRates", row.id)}
                />
              ))}
            </GroupedList>
          )}
          {listMessage("contractRates")}
          <AddChange onClick={() => add("contractRates")}>Adicionar mudança de taxa</AddChange>
        </Section>

        <Section title="Seguros">
          {insuranceRows.length > 0 && (
            <GroupedList>
              {insuranceRows.map(({ list, row, index }) => (
                <ChangeRow
                  key={row.id}
                  label={`${insuranceOf[list]} ${since(row)}`}
                  value={`${typedPercent(row.rate)} % ao mês`}
                  messages={rowMessages(messages, list, index)}
                  onOpen={() => open(list, row.id)}
                />
              ))}
            </GroupedList>
          )}
          {listMessage("mipRates", "MIP: ")}
          {listMessage("dfiRates", "DFI: ")}
          <AddChange onClick={() => add("mipRates")}>Adicionar mudança</AddChange>
        </Section>

        <Section title="Taxas">
          {feeRows.length > 0 && (
            <GroupedList>
              {feeRows.map(({ row, index }) => (
                <ChangeRow
                  key={row.id}
                  label={`Taxa de administração ${since(row)}`}
                  value={`${typedMoney(row.amount)} por mês`}
                  messages={rowMessages(messages, "fees", index)}
                  onOpen={() => open("fees", row.id)}
                />
              ))}
            </GroupedList>
          )}
          {listMessage("fees")}
          <AddChange onClick={() => add("fees")}>Adicionar mudança</AddChange>
        </Section>

        <p className="text-footnote text-muted-foreground">
          Cada mudança vale a partir da data indicada, até a próxima.
        </p>
      </Page>
      {sheet && <ChangeSheet {...sheet} />}
    </form>
  );
}

/** Contract is the Contrato page, where the owner edits the registered mortgage's terms. */
export function Contract() {
  const { data } = useMortgage();
  // MortgageGate opens the app only once the mortgage is loaded and registered.
  if (!data) return null;
  return <ContractForm mortgage={data} />;
}
