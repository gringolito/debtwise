import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { ChoiceRow, InputRow } from "@/components/patterns/FieldRows";
import { GroupedList, GroupedListLabel } from "@/components/patterns/GroupedList";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { type BondQuote, bondsKey, fetchBonds, type Lot } from "@/lib/api";
import { type BondType, bondKinds, bondLabel, bondTypeOptions } from "@/lib/bondKinds";
import { formatMoney } from "@/lib/format";
import {
  blankLot,
  type LotFormValues,
  lotErrors,
  lotFieldMessages,
  lotInput,
  lotPreviewInput,
  valuesFromLot,
} from "@/lib/lots";
import { useAddLot, useEditLot, useLotPreview } from "@/lib/lotQueries";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

type Bond = Pick<BondQuote, "type" | "maturity">;

/** bondKey tells bonds apart as the value of an option. */
const bondKey = ({ type, maturity }: Bond) => `${type} ${maturity}`;

// The picker's value while the owner records a bond the catalogue does not offer.
const OTHER_BOND = "other";

interface LotSheetProps {
  /** The lot to edit; a new one is recorded while it is undefined. */
  lot?: Lot;
  onClose: () => void;
  onSaved?: (lot: Lot) => void;
}

/** LotSheet records a purchase of a bond, or edits one, showing what it cost before saving. */
export function LotSheet({ lot, onClose, onSaved }: LotSheetProps) {
  const [values, setValues] = useState(() => (lot ? valuesFromLot(lot) : blankLot));
  const [otherBond, setOtherBond] = useState(false);
  const bonds = useQuery({ queryKey: bondsKey, queryFn: fetchBonds });
  const add = useAddLot();
  const edit = useEditLot();
  const save = lot ? edit : add;
  const errors = lotErrors(save.error, values.type);

  const typed = lotPreviewInput(values);
  const preview = useLotPreview(lotPreviewInput(useDebouncedValue(values)));
  const answer = typed && !preview.isError ? preview.data : undefined;
  const stale = JSON.stringify(answer?.input) !== JSON.stringify(typed);

  const catalogue: Bond[] = [...(bonds.data?.bonds ?? [])];
  if (lot && !catalogue.some((bond) => bondKey(bond) === bondKey(lot))) catalogue.push(lot);
  const picked = otherBond ? OTHER_BOND : values.maturity ? bondKey(values) : "";

  function change(next: LotFormValues) {
    save.reset();
    setValues(next);
  }

  function pick(key: string) {
    setOtherBond(key === OTHER_BOND);
    if (key === OTHER_BOND) {
      save.reset();
      return;
    }
    const bond = catalogue.find((candidate) => bondKey(candidate) === key);
    change({ ...values, type: bond?.type ?? values.type, maturity: bond?.maturity ?? "" });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const input = lotInput(values);
    const saved = (result: Lot) => {
      onSaved?.(result);
      onClose();
    };
    if (lot) edit.mutate({ id: lot.id, input }, { onSuccess: saved });
    else add.mutate(input, { onSuccess: saved });
  }

  const title = lot ? "Editar compra" : "Adicionar compra";
  const ratePrefix = picked !== "" && bondKinds[values.type].ipcaLinked ? "IPCA +" : undefined;
  // With no bond picked the form sends no maturity, and the server's complaint about it is the
  // owner's not having picked one.
  const bondMessage =
    picked === ""
      ? errors.has("maturity")
        ? lotFieldMessages.type
        : undefined
      : (errors.get("type") ?? errors.get("maturity"));
  return (
    <Dialog open onOpenChange={(open) => open || onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogClose asChild>
            <Button variant="plain" size="inline">
              Cancelar
            </Button>
          </DialogClose>
        </DialogHeader>
        <form noValidate aria-label={title} className="flex flex-col gap-6" onSubmit={submit}>
          {save.isError && errors.size === 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                {lot ? "Não foi possível salvar a compra." : "Não foi possível adicionar a compra."}
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-2">
            <GroupedList>
              <ChoiceRow label="Título" message={otherBond ? undefined : bondMessage}>
                {(labelId, describedBy) => (
                  <NativeSelect
                    variant="inline"
                    aria-labelledby={labelId}
                    aria-describedby={describedBy}
                    aria-invalid={describedBy !== undefined || undefined}
                    value={picked}
                    onChange={(event) => pick(event.target.value)}
                  >
                    {picked === "" && <NativeSelectOption value="">Escolha</NativeSelectOption>}
                    {catalogue.map((bond) => (
                      <NativeSelectOption key={bondKey(bond)} value={bondKey(bond)}>
                        {bondLabel(bond)}
                      </NativeSelectOption>
                    ))}
                    <NativeSelectOption value={OTHER_BOND}>Outro título</NativeSelectOption>
                  </NativeSelect>
                )}
              </ChoiceRow>
              {otherBond && (
                <>
                  <ChoiceRow label="Tipo" message={errors.get("type")}>
                    {(labelId, describedBy) => (
                      <NativeSelect
                        variant="inline"
                        aria-labelledby={labelId}
                        aria-describedby={describedBy}
                        aria-invalid={describedBy !== undefined || undefined}
                        value={values.type}
                        onChange={(event) =>
                          change({ ...values, type: event.target.value as BondType })
                        }
                      >
                        {bondTypeOptions.map(({ value, label }) => (
                          <NativeSelectOption key={value} value={value}>
                            {label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    )}
                  </ChoiceRow>
                  <InputRow
                    label="Vencimento"
                    type="date"
                    value={values.maturity}
                    onChange={(maturity) => change({ ...values, maturity })}
                    message={errors.get("maturity")}
                  />
                </>
              )}
              <InputRow
                label="Data da compra"
                type="date"
                value={values.purchaseDate}
                onChange={(purchaseDate) => change({ ...values, purchaseDate })}
                message={errors.get("purchase_date")}
              />
              <InputRow
                label="Taxa"
                inputMode="decimal"
                placeholder="0,00"
                prefix={ratePrefix}
                suffix="%"
                value={values.rate}
                onChange={(rate) => change({ ...values, rate })}
                message={errors.get("rate")}
              />
              <InputRow
                label="Preço unitário"
                inputMode="decimal"
                grouped
                placeholder="0,00"
                prefix="R$"
                value={values.unitPrice}
                onChange={(unitPrice) => change({ ...values, unitPrice })}
                message={errors.get("unit_price")}
              />
              <InputRow
                label="Quantidade"
                inputMode="decimal"
                grouped
                placeholder="0"
                value={values.quantity}
                onChange={(quantity) => change({ ...values, quantity })}
                message={errors.get("quantity")}
              />
            </GroupedList>
            <p className="px-4 text-footnote text-muted-foreground">
              Esses dados estão na nota de negociação ou no extrato da corretora.
            </p>
          </div>
          <div
            aria-busy={answer !== undefined && stale}
            className="flex min-h-13 items-center gap-4 rounded-lg border bg-muted px-4 py-3 text-body transition-opacity aria-busy:opacity-50"
          >
            <GroupedListLabel className="text-muted-foreground">Valor investido</GroupedListLabel>
            <span aria-live="polite" className="font-medium">
              {answer ? formatMoney(answer.preview.cost) : "—"}
            </span>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={save.isPending}>
              {lot ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
