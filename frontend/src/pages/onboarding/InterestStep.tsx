import { PlusIcon } from "lucide-react";
import { useId } from "react";
import {
  GroupedList,
  GroupedListHeader,
  GroupedListItem,
  GroupedListLabel,
  GroupedListRow,
  GroupedListSection,
} from "@/components/patterns/GroupedList";
import { SegmentedControl, SegmentedControlItem } from "@/components/patterns/SegmentedControl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type Basis,
  blankContractRate,
  type ContractRateRow,
  rowLocation,
} from "@/lib/mortgageForm";
import { InputRow, SwitchRow } from "@/pages/onboarding/fields";
import type { StepProps } from "@/pages/onboarding/StepFrame";

function BasisControl(
  props: Omit<React.ComponentProps<typeof SegmentedControl<Basis>>, "children">,
) {
  return (
    <SegmentedControl {...props}>
      <SegmentedControlItem value="effective">Efetiva</SegmentedControlItem>
      <SegmentedControlItem value="nominal">Nominal</SegmentedControlItem>
    </SegmentedControl>
  );
}

function RateChange({
  row,
  index,
  onChange,
  onRemove,
  isInvalid,
}: {
  row: ContractRateRow;
  index: number;
  onChange: (patch: Partial<ContractRateRow>) => void;
  onRemove: () => void;
  isInvalid: StepProps["isInvalid"];
}) {
  const id = useId();
  const at = (field: string) => rowLocation("contract_rates", index, field);
  const title = `Mudança ${index}`;
  return (
    <GroupedListSection aria-label={title}>
      <div className="flex items-baseline justify-between">
        <GroupedListHeader>{title}</GroupedListHeader>
        <Button type="button" variant="plain" size="inline" onClick={onRemove}>
          Remover
        </Button>
      </div>
      <GroupedList>
        <InputRow
          label="A partir de"
          type="date"
          value={row.effectiveFrom}
          onChange={(effectiveFrom) => onChange({ effectiveFrom })}
          invalid={isInvalid(at("effective_from"))}
        />
        <InputRow
          label="Taxa"
          inputMode="decimal"
          className="w-20"
          placeholder="0,00"
          suffix="% ao ano"
          value={row.rate}
          onChange={(rate) => onChange({ rate })}
          invalid={isInvalid(at("rate"))}
        />
        <GroupedListItem>
          <GroupedListRow>
            <GroupedListLabel id={`${id}-basis`}>Base</GroupedListLabel>
            <BasisControl
              aria-labelledby={`${id}-basis`}
              value={row.basis}
              onValueChange={(basis) => onChange({ basis })}
            />
          </GroupedListRow>
        </GroupedListItem>
        <SwitchRow
          label="Parte vinculada à poupança"
          checked={row.poupancaAdditional}
          onCheckedChange={(poupancaAdditional) => onChange({ poupancaAdditional })}
          invalid={isInvalid(at("poupanca_additional"))}
        />
      </GroupedList>
    </GroupedListSection>
  );
}

export function InterestStep({ values, set, isInvalid }: StepProps) {
  const id = useId();
  const rows = values.contractRates;
  const [rate, ...changes] = rows;
  const update = (rowId: number, patch: Partial<ContractRateRow>) =>
    set(
      "contractRates",
      rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    );
  const rateInvalid = isInvalid("contract_rates", rowLocation("contract_rates", 0, "rate"));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-baseline justify-center gap-3">
          <Input
            variant="hero"
            aria-label="Taxa de juros anual"
            aria-invalid={rateInvalid || undefined}
            aria-describedby={rateInvalid ? `${id}-rate-message` : undefined}
            inputMode="decimal"
            placeholder="0,00"
            value={rate.rate}
            onChange={(event) => update(rate.id, { rate: event.target.value })}
          />
          <span className="text-title-2 font-normal text-muted-foreground">% ao ano</span>
        </div>
        {rateInvalid && (
          <p id={`${id}-rate-message`} className="text-callout text-destructive">
            Valor inválido.
          </p>
        )}
        <BasisControl
          aria-label="Base da taxa"
          value={rate.basis}
          onValueChange={(basis) => update(rate.id, { basis })}
        />
        <p className="text-footnote text-muted-foreground">
          Se o contrato mostrar as duas, use a efetiva.
        </p>
      </div>
      <GroupedList>
        <SwitchRow
          label="Parte vinculada à poupança"
          hint="Só em alguns contratos."
          checked={rate.poupancaAdditional}
          onCheckedChange={(poupancaAdditional) => update(rate.id, { poupancaAdditional })}
          invalid={isInvalid(rowLocation("contract_rates", 0, "poupanca_additional"))}
        />
      </GroupedList>
      {changes.map((row, i) => (
        <RateChange
          key={row.id}
          row={row}
          index={i + 1}
          onChange={(patch) => update(row.id, patch)}
          onRemove={() =>
            set(
              "contractRates",
              rows.filter((r) => r.id !== row.id),
            )
          }
          isInvalid={isInvalid}
        />
      ))}
      <Button
        type="button"
        variant="link"
        size="inline"
        className="self-start"
        onClick={() =>
          set("contractRates", [...rows, { ...blankContractRate(), basis: rate.basis }])
        }
      >
        <PlusIcon aria-hidden="true" />
        {changes.length === 0
          ? "A taxa mudou durante o contrato? Adicionar mudança"
          : "Adicionar outra mudança"}
      </Button>
    </div>
  );
}
