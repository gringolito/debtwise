import { ChoiceRow, InputRow, SwitchRow } from "@/components/patterns/FieldRows";
import { GroupedList } from "@/components/patterns/GroupedList";
import { SegmentedControl, SegmentedControlItem } from "@/components/patterns/SegmentedControl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Basis, ContractRateRow, FeeRow, MonthlyRateRow } from "@/lib/mortgageForm";
import type { Change, ChangeList, InsuranceList } from "@/pages/contract/changes";
import { usePrototypeVariant } from "@/prototypes/variant";
import { Trash2Icon } from "lucide-react";

/** The insurance a new change belongs to, which only a new change can still switch. */
export interface InsuranceChoice {
  value: InsuranceList;
  onChange: (list: InsuranceList) => void;
}

/** What the bank charged for the insurance on the first installment, which gives the rate. */
export interface FirstChargeInput {
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  invalid: boolean;
}

type Patch = Partial<ContractRateRow> | Partial<MonthlyRateRow> | Partial<FeeRow>;

export interface ChangeSheetProps {
  change: Change;
  update: (patch: Patch) => void;
  /** The message for what the API rejected in a field of the row, such as "rate". */
  messageOf: (field: string) => string | undefined;
  insurance?: InsuranceChoice;
  firstCharge?: FirstChargeInput;
  onDone: () => void;
  /** Removes the change from the form; a change the sheet is adding has nothing to remove. */
  onRemove?: () => void;
  onCancel: () => void;
}

const titles: Record<ChangeList, string> = {
  contractRates: "Mudança de taxa",
  mipRates: "Mudança de seguro",
  dfiRates: "Mudança de seguro",
  fees: "Mudança da taxa de administração",
};

type FieldsProps<T> = Pick<ChangeSheetProps, "messageOf"> & {
  row: T;
  update: (patch: Partial<T>) => void;
};

function ContractRateFields({ row, update, messageOf }: FieldsProps<ContractRateRow>) {
  return (
    <>
      <InputRow
        label="Taxa"
        inputMode="decimal"
        className="w-24"
        placeholder="0,00"
        suffix="% ao ano"
        value={row.rate}
        onChange={(rate) => update({ rate })}
        message={messageOf("rate")}
      />
      <ChoiceRow label="Base" message={messageOf("basis")}>
        {(labelId, describedBy) => (
          <SegmentedControl<Basis>
            aria-labelledby={labelId}
            aria-describedby={describedBy}
            value={row.basis}
            onValueChange={(basis) => update({ basis })}
          >
            <SegmentedControlItem value="effective">Efetiva</SegmentedControlItem>
            <SegmentedControlItem value="nominal">Nominal</SegmentedControlItem>
          </SegmentedControl>
        )}
      </ChoiceRow>
      <SwitchRow
        label="Parte vinculada à poupança"
        checked={row.poupancaAdditional}
        onCheckedChange={(poupancaAdditional) => update({ poupancaAdditional })}
        message={messageOf("poupanca_additional")}
      />
    </>
  );
}

function InsuranceFields({
  row,
  update,
  messageOf,
  firstCharge,
}: FieldsProps<MonthlyRateRow> & Pick<ChangeSheetProps, "firstCharge">) {
  const proto = usePrototypeVariant() !== "A";
  return (
    <>
      <InputRow
        label="Taxa"
        inputMode="decimal"
        className="w-24"
        placeholder="0,00"
        suffix="% ao mês"
        value={row.rate}
        onChange={(rate) => update({ rate })}
        message={messageOf("rate")}
      />
      {firstCharge && (
        <InputRow
          label="Valor na primeira prestação"
          hint={
            firstCharge.invalid
              ? undefined
              : (firstCharge.hint ??
                (proto
                  ? "Para calcular a taxa."
                  : "Preencha para calcular a taxa pelo valor cobrado."))
          }
          grouped
          prefix="R$"
          inputMode="decimal"
          className="w-24"
          placeholder="0,00"
          value={firstCharge.value}
          onChange={firstCharge.onChange}
          message={firstCharge.invalid ? "Valor inválido." : undefined}
        />
      )}
    </>
  );
}

function FeeFields({ row, update, messageOf }: FieldsProps<FeeRow>) {
  return (
    <InputRow
      label="Valor"
      grouped
      prefix="R$"
      suffix="por mês"
      inputMode="decimal"
      className="w-24"
      placeholder="0,00"
      value={row.amount}
      onChange={(amount) => update({ amount })}
      message={messageOf("amount")}
    />
  );
}

function ChangeFields({ change, update, messageOf, firstCharge }: ChangeSheetProps) {
  switch (change.list) {
    case "contractRates":
      return <ContractRateFields row={change.row} update={update} messageOf={messageOf} />;
    case "fees":
      return <FeeFields row={change.row} update={update} messageOf={messageOf} />;
    default:
      return (
        <InsuranceFields
          row={change.row}
          update={update}
          messageOf={messageOf}
          firstCharge={firstCharge}
        />
      );
  }
}

/** ChangeSheet edits one dated change of a list over the page, until "Concluir" or "Cancelar". */
export function ChangeSheet(props: ChangeSheetProps) {
  const { change, update, messageOf, insurance, firstCharge, onDone, onRemove, onCancel } = props;
  const proto = usePrototypeVariant() !== "A";
  return (
    <Dialog open onOpenChange={(open) => open || onCancel()}>
      <DialogContent aria-describedby={undefined}>
        <form
          noValidate
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            // The sheet renders in a portal, but React still bubbles its submit to the page's form.
            event.preventDefault();
            event.stopPropagation();
            // A charge that gives no rate would stay on the form unseen, so it holds the sheet open.
            if (!firstCharge?.invalid) onDone();
          }}
        >
          <DialogHeader>
            <DialogTitle>{titles[change.list]}</DialogTitle>
            <DialogClose asChild>
              <Button type="button" variant="plain" size="inline">
                Cancelar
              </Button>
            </DialogClose>
          </DialogHeader>
          <GroupedList>
            {insurance && (
              <ChoiceRow label="Seguro">
                {(labelId) => (
                  <SegmentedControl
                    aria-labelledby={labelId}
                    value={insurance.value}
                    onValueChange={insurance.onChange}
                  >
                    <SegmentedControlItem value="mipRates">MIP</SegmentedControlItem>
                    <SegmentedControlItem value="dfiRates">DFI</SegmentedControlItem>
                  </SegmentedControl>
                )}
              </ChoiceRow>
            )}
            <InputRow
              label="A partir de"
              type="date"
              value={change.row.effectiveFrom}
              onChange={(effectiveFrom) => update({ effectiveFrom })}
              message={messageOf("effective_from")}
            />
            <ChangeFields {...props} />
          </GroupedList>
          <DialogFooter>
            {proto ? (
              <div className="flex items-center gap-2">
                {onRemove && (
                  <Button
                    type="button"
                    variant="plain"
                    size="icon"
                    aria-label="Remover mudança"
                    title="Remover mudança"
                    onClick={onRemove}
                  >
                    <Trash2Icon aria-hidden="true" strokeWidth={1.75} />
                  </Button>
                )}
                <Button type="submit" className="flex-1">
                  Concluir
                </Button>
              </div>
            ) : (
              <>
                <Button type="submit">Concluir</Button>
                {onRemove && (
                  <Button type="button" variant="destructive" onClick={onRemove}>
                    Remover mudança
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
