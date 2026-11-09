import {
  GroupedList,
  GroupedListHeader,
  GroupedListItem,
  GroupedListLabel,
  GroupedListRow,
  GroupedListSection,
  GroupedListValue,
} from "@/components/patterns/GroupedList";
import { Button } from "@/components/ui/button";
import type { MortgageTerms, Schedule } from "@/lib/api";
import { latestDue, today } from "@/lib/dashboard";
import { formatMoney, formatMonthYear, formatRate } from "@/lib/format";
import { amortizationSystemLabels, indexerLabels } from "@/lib/mortgageForm";
import { BalanceCurve } from "@/pages/onboarding/BalanceCurve";

const basisNames = { effective: "efetiva", nominal: "nominal" } as const;

function Figure({ name, value, className }: { name: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-footnote text-muted-foreground">{name}</dt>
      <dd className="text-title-2">{value}</dd>
    </div>
  );
}

function interestSummary(terms: MortgageTerms): string {
  const [rate, ...changes] = terms.contract_rates;
  const poupanca = rate.poupanca_additional ? " + poupança" : "";
  const summary = `${formatRate(rate.rate)} ao ano (${basisNames[rate.basis]})${poupanca}`;
  if (changes.length === 0) return summary;
  return `${summary} · ${changes.length} ${changes.length === 1 ? "mudança" : "mudanças"}`;
}

interface ReviewStepProps {
  terms: MortgageTerms;
  schedule: Schedule;
  /** Goes back to the first step to change what was informed. */
  onEdit: () => void;
}

export function ReviewStep({ terms, schedule, onEdit }: ReviewStepProps) {
  const now = today();
  const { installments } = schedule;
  const due = latestDue(installments, now);
  const current = due ?? installments[0];
  const last = installments.at(-1);
  const [mip] = terms.mip_rates;
  const [dfi] = terms.dfi_rates;
  const [fee] = terms.fees;

  return (
    <>
      <section aria-label="Resumo" className="flex flex-col gap-6 rounded-lg glass p-6">
        <dl className="flex justify-between gap-6">
          {last && <Figure name="Quitação prevista" value={formatMonthYear(last.due_date)} />}
          {current && (
            <Figure
              name={due ? "Prestação atual" : "Primeira prestação"}
              value={formatMoney(current.amount)}
              className="text-right"
            />
          )}
        </dl>
        <hr />
        <div className="flex flex-col gap-2">
          <p className="text-footnote text-muted-foreground">Saldo devedor ao longo do tempo</p>
          <BalanceCurve
            contractDate={terms.contract_date}
            originalAmount={terms.original_amount}
            installments={installments}
            today={now}
          />
        </div>
      </section>

      <GroupedListSection aria-label="Parâmetros informados">
        <div className="flex items-baseline justify-between">
          <GroupedListHeader>Parâmetros informados</GroupedListHeader>
          <Button type="button" variant="link" size="inline" onClick={onEdit}>
            Editar
          </Button>
        </div>
        <GroupedList>
          {[
            ["Contrato", `${formatMoney(terms.original_amount)} · ${terms.term_months} meses`],
            ["Sistema", amortizationSystemLabels[terms.amortization_system]],
            ["Correção", indexerLabels[terms.indexer]],
            ["Juros", interestSummary(terms)],
            [
              "Seguros e taxas",
              `MIP ${formatRate(mip.rate)} · DFI ${formatRate(dfi.rate)} · ${formatMoney(fee.amount)}`,
            ],
          ].map(([label, value]) => (
            <GroupedListItem key={label}>
              <GroupedListRow>
                <GroupedListLabel>{label}</GroupedListLabel>
                <GroupedListValue>{value}</GroupedListValue>
              </GroupedListRow>
            </GroupedListItem>
          ))}
        </GroupedList>
      </GroupedListSection>
    </>
  );
}
