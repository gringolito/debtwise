import { GroupedList } from "@/components/patterns/GroupedList";
import { InputRow } from "@/pages/onboarding/fields";
import type { StepProps } from "@/pages/onboarding/StepFrame";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The term in years, as the contract often states it: "420" is "(35 anos)". */
function termInYears(text: string): string | undefined {
  if (!/^\d+$/.test(text.trim())) return undefined;
  const months = Number(text);
  if (months < 12) return undefined;
  const years = plural(Math.floor(months / 12), "ano", "anos");
  const rest = months % 12;
  return rest === 0 ? `(${years})` : `(${years} e ${plural(rest, "mês", "meses")})`;
}

export function ContractStep({ values, set, isInvalid }: StepProps) {
  const years = termInYears(values.termMonths);
  return (
    <GroupedList>
      <InputRow
        label="Data do contrato"
        type="date"
        value={values.contractDate}
        onChange={(value) => set("contractDate", value)}
        invalid={isInvalid("contract_date")}
      />
      <InputRow
        label="Valor financiado"
        hint="Quanto o banco emprestou, sem a entrada."
        prefix="R$"
        inputMode="decimal"
        placeholder="0,00"
        value={values.originalAmount}
        onChange={(value) => set("originalAmount", value)}
        invalid={isInvalid("original_amount")}
      />
      <InputRow
        label="Prazo"
        inputMode="numeric"
        className="w-16"
        suffix={years ? `meses ${years}` : "meses"}
        value={values.termMonths}
        onChange={(value) => set("termMonths", value)}
        invalid={isInvalid("term_months")}
      />
      <InputRow
        label="Primeira prestação"
        type="date"
        value={values.firstInstallmentDate}
        onChange={(value) => set("firstInstallmentDate", value)}
        invalid={isInvalid("first_installment_date")}
      />
    </GroupedList>
  );
}
