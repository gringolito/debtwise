import { type FormEvent, useState } from "react";
import { DeleteEventDialog } from "@/components/mortgage/DeleteEventDialog";
import { SheetNote } from "@/components/mortgage/SheetFields";
import { InputRow } from "@/components/patterns/FieldRows";
import {
  GroupedList,
  GroupedListHeader,
  GroupedListSection,
} from "@/components/patterns/GroupedList";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Prepayment, PrepaymentPreview } from "@/lib/api";
import { today } from "@/lib/dashboard";
import { formatDate, formatMoney, formatMonthYear } from "@/lib/format";
import {
  blankPrepayment,
  effectDescriptions,
  effectLabels,
  effectOptions,
  type PrepaymentEffect,
  type PrepaymentValues,
  prepaymentErrors,
  prepaymentInput,
  valuesFromPrepayment,
} from "@/lib/mortgageEvents";
import {
  useAddPrepayment,
  useDeletePrepayment,
  useEditPrepayment,
  usePrepaymentPreview,
} from "@/lib/mortgageQueries";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

function Change({ from, to }: { from: string; to: string }) {
  return (
    <>
      <span className="font-medium">{from}</span> para{" "}
      <span className="font-medium text-accent">{to}</span>
    </>
  );
}

function PreviewNote({
  preview,
  effect,
}: {
  preview: PrepaymentPreview;
  effect: PrepaymentEffect;
}) {
  const { current_installment: before, installment: after } = preview;
  if (effect === "lower_installment" && before !== undefined && after !== undefined) {
    return (
      <SheetNote>
        Prestação passa de <Change from={formatMoney(before)} to={formatMoney(after)} />
      </SheetNote>
    );
  }
  const from = formatMonthYear(preview.current_payoff_date);
  const to = formatMonthYear(preview.payoff_date);
  if (from === to) return <SheetNote>A quitação continua em {from}.</SheetNote>;
  return (
    <SheetNote>
      Quitação passa de <Change from={from} to={to} />
    </SheetNote>
  );
}

interface PrepaymentSheetProps {
  /** The prepayment to edit; a new one is recorded while it is undefined. */
  prepayment?: Prepayment;
  onClose: () => void;
}

/** PrepaymentSheet records a prepayment, or edits or deletes one, previewing what it changes. */
export function PrepaymentSheet({ prepayment, onClose }: PrepaymentSheetProps) {
  const [values, setValues] = useState<PrepaymentValues>(() =>
    prepayment ? valuesFromPrepayment(prepayment) : { ...blankPrepayment, date: today() },
  );
  const add = useAddPrepayment();
  const edit = useEditPrepayment();
  const remove = useDeletePrepayment();
  const save = prepayment ? edit : add;

  const previewInput = (typed: PrepaymentValues) =>
    typed.date && typed.amount.trim()
      ? { ...prepaymentInput(typed), replaces: prepayment?.id }
      : undefined;
  const typed = previewInput(values);
  const preview = usePrepaymentPreview(previewInput(useDebouncedValue(values)));
  const errors = prepaymentErrors(save.error ?? preview.error);
  const answer = typed && !preview.isError ? preview.data : undefined;
  const stale = JSON.stringify(answer?.input) !== JSON.stringify(typed);

  function change(next: PrepaymentValues) {
    save.reset();
    setValues(next);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const input = prepaymentInput(values);
    if (prepayment) edit.mutate({ id: prepayment.id, input }, { onSuccess: onClose });
    else add.mutate(input, { onSuccess: onClose });
  }

  const title = prepayment ? "Editar amortização" : "Registrar amortização";
  const when = prepayment && formatDate(prepayment.date);
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
        <form
          noValidate
          aria-label={prepayment ? `Editar amortização de ${when}` : title}
          className="flex flex-col gap-6"
          onSubmit={submit}
        >
          {save.isError && errors.size === 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                {prepayment
                  ? "Não foi possível salvar a amortização extraordinária."
                  : "Não foi possível registrar a amortização extraordinária."}
              </AlertDescription>
            </Alert>
          )}
          <GroupedList>
            <InputRow
              label="Data"
              type="date"
              value={values.date}
              onChange={(date) => change({ ...values, date })}
              message={errors.get("date")}
            />
            <InputRow
              label="Valor"
              grouped
              prefix="R$"
              inputMode="decimal"
              placeholder="0,00"
              value={values.amount}
              onChange={(amount) => change({ ...values, amount })}
              message={errors.get("amount")}
            />
          </GroupedList>
          <GroupedListSection>
            <GroupedListHeader id="prepayment-effect">Efeito</GroupedListHeader>
            <RadioGroup
              aria-labelledby="prepayment-effect"
              value={values.effect}
              onValueChange={(effect) => change({ ...values, effect: effect as PrepaymentEffect })}
            >
              {effectOptions.map(({ value }) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-4 rounded-lg border bg-card px-4 py-3 transition-colors has-data-checked:border-accent-soft has-data-checked:bg-accent-tint"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span id={`effect-${value}-name`} className="text-headline">
                      {effectLabels[value]}
                    </span>
                    <span
                      id={`effect-${value}-description`}
                      className="text-callout text-muted-foreground"
                    >
                      {effectDescriptions[value]}
                    </span>
                  </span>
                  <RadioGroupItem
                    value={value}
                    aria-labelledby={`effect-${value}-name`}
                    aria-describedby={`effect-${value}-description`}
                  />
                </label>
              ))}
            </RadioGroup>
          </GroupedListSection>
          {answer && (
            <div aria-busy={stale} className="transition-opacity aria-busy:opacity-50">
              <PreviewNote preview={answer.preview} effect={answer.input.effect} />
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={save.isPending}>
              {prepayment ? "Salvar" : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
        {prepayment && (
          <div className="flex flex-col gap-2">
            {remove.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  Não foi possível excluir a amortização extraordinária.
                </AlertDescription>
              </Alert>
            )}
            <DeleteEventDialog
              size="default"
              title="Excluir amortização extraordinária?"
              description={`A amortização de ${when} será removida e a evolução do financiamento será recalculada sem ela.`}
              onConfirm={() => remove.mutate(prepayment.id, { onSuccess: onClose })}
            >
              Excluir amortização
            </DeleteEventDialog>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
