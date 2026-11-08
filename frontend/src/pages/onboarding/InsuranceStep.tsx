import { useState } from "react";
import {
  GroupedList,
  GroupedListHeader,
  GroupedListSection,
} from "@/components/patterns/GroupedList";
import { Button } from "@/components/ui/button";
import { firstChargeOf, type Insurance, insuranceFields, rowLocation } from "@/lib/mortgageForm";
import { InputRow } from "@/components/patterns/FieldRows";
import type { StepProps } from "@/pages/onboarding/StepFrame";

const insurances: { insurance: Insurance; label: string; hint: string; needsBase: string }[] = [
  {
    insurance: "MIP",
    label: "MIP · Morte e invalidez",
    hint: "Sobre o saldo devedor.",
    needsBase: "Preencha o valor financiado para calcular a taxa.",
  },
  {
    insurance: "DFI",
    label: "DFI · Danos ao imóvel",
    hint: "Sobre o valor de avaliação.",
    needsBase: "Preencha o valor de avaliação para calcular a taxa.",
  },
];

export function InsuranceStep({ values, set, messageOf }: StepProps) {
  const [fromFirstInstallment, setFromFirstInstallment] = useState(
    () => values.firstInstallmentMip !== "" || values.firstInstallmentDfi !== "",
  );
  const [fee] = values.fees;

  return (
    <div className="flex flex-col gap-6">
      <GroupedListSection>
        <GroupedListHeader>Imóvel</GroupedListHeader>
        <GroupedList>
          <InputRow
            label="Valor de avaliação"
            hint="O valor do imóvel definido pelo banco no contrato."
            prefix="R$"
            inputMode="decimal"
            placeholder="0,00"
            value={values.appraisalValue}
            onChange={(value) => set("appraisalValue", value)}
            message={messageOf("appraisal_value")}
          />
        </GroupedList>
      </GroupedListSection>

      <GroupedListSection>
        <GroupedListHeader>Seguros</GroupedListHeader>
        <GroupedList>
          {insurances.map(({ insurance, label, hint }) => {
            const { rates } = insuranceFields[insurance];
            const [row] = values[rates];
            return (
              <InputRow
                key={insurance}
                label={label}
                hint={hint}
                inputMode="decimal"
                className="w-24"
                placeholder="0,00"
                suffix="% ao mês"
                value={row.rate}
                onChange={(rate) => set(rates, [{ ...row, rate }])}
                message={messageOf(rates, rowLocation(rates, 0, "rate"))}
              />
            );
          })}
        </GroupedList>
        {!fromFirstInstallment && (
          <Button
            type="button"
            variant="link"
            size="inline"
            className="self-start"
            onClick={() => setFromFirstInstallment(true)}
          >
            Não sei a taxa. Usar o valor da primeira prestação
          </Button>
        )}
      </GroupedListSection>

      {fromFirstInstallment && (
        <GroupedListSection>
          <GroupedListHeader>Cobrado na primeira prestação</GroupedListHeader>
          <GroupedList>
            {insurances.map(({ insurance, needsBase }) => {
              const { charge } = insuranceFields[insurance];
              const derived = firstChargeOf(values, insurance);
              return (
                <InputRow
                  key={insurance}
                  label={`${insurance} cobrado`}
                  hint={derived.needsBase ? needsBase : undefined}
                  prefix="R$"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={values[charge]}
                  onChange={(value) => set(charge, value)}
                  message={
                    !derived.needsBase && values[charge].trim() !== "" && derived.rate === undefined
                      ? "Valor inválido."
                      : undefined
                  }
                />
              );
            })}
          </GroupedList>
        </GroupedListSection>
      )}

      <GroupedListSection>
        <GroupedListHeader>Taxas</GroupedListHeader>
        <GroupedList>
          <InputRow
            label="Taxa de administração"
            prefix="R$"
            suffix="por mês"
            inputMode="decimal"
            className="w-24"
            placeholder="0,00"
            value={fee.amount}
            onChange={(amount) => set("fees", [{ ...fee, amount }])}
            message={messageOf("fees", rowLocation("fees", 0, "amount"))}
          />
        </GroupedList>
      </GroupedListSection>
    </div>
  );
}
