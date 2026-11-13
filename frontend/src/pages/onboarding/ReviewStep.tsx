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
  /** Opens the step that asked for a parameter, to change it and come back here. */
  onEditStep: (step: number) => void;
}

export function ReviewStep({ terms, schedule, onEditStep }: ReviewStepProps) {
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
        <GroupedListHeader>Parâmetros informados</GroupedListHeader>
        <GroupedList>
          {(
            [
              [1, "Contrato", `${formatMoney(terms.original_amount)} · ${terms.term_months} meses`],
              [2, "Sistema", amortizationSystemLabels[terms.amortization_system]],
              [3, "Correção", indexerLabels[terms.indexer]],
              [4, "Juros", interestSummary(terms)],
              [
                5,
                "Seguros e taxas",
                `MIP ${formatRate(mip.rate)} · DFI ${formatRate(dfi.rate)} · ${formatMoney(fee.amount)}`,
              ],
            ] as const
          ).map(([step, label, value]) => (
            <GroupedListItem key={label}>
              <GroupedListRow asChild>
                <button type="button" onClick={() => onEditStep(step)}>
                  <GroupedListLabel className="flex-none">{label}</GroupedListLabel>
                  <GroupedListValue className="min-w-0 flex-1">{value}</GroupedListValue>
                  <GroupedListChevron />
                </button>
              </GroupedListRow>
            </GroupedListItem>
          ))}
        </GroupedList>
      </GroupedListSection>
    </>
  );
}
