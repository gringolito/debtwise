import { type FormEvent, useId, useState } from "react";
import { EffectField } from "@/components/mortgage/SheetFields";
import { ErrorPanel } from "@/components/patterns/ErrorPanel";
import { InputRow } from "@/components/patterns/FieldRows";
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
import { Loading } from "@/components/patterns/Loading";
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
import { Skeleton } from "@/components/ui/skeleton";
import type { DefaultComparison } from "@/lib/api";
import { useDefaultComparison, useSaveDefaultComparison } from "@/lib/decisionQueries";
import { decisionErrors } from "@/lib/decisions";
import { formatMoney, inputToMoney, moneyToInput } from "@/lib/format";
import { effectLabels } from "@/lib/mortgageEvents";

const TITLE = "Comparação padrão";

/** DefaultComparisonSheet changes the amount and effect Início compares, saving them on "Salvar". */
function DefaultComparisonSheet({
  comparison,
  onClose,
}: {
  comparison: DefaultComparison;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(() => moneyToInput(comparison.amount));
  const [effect, setEffect] = useState(comparison.effect);
  const save = useSaveDefaultComparison();
  const errors = decisionErrors(save.error);

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate({ amount: inputToMoney(amount), effect }, { onSuccess: onClose });
  }

  return (
    <Dialog open onOpenChange={(open) => open || onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{TITLE}</DialogTitle>
          <DialogClose asChild>
            <Button variant="plain" size="inline">
              Cancelar
            </Button>
          </DialogClose>
        </DialogHeader>
        <form noValidate aria-label={TITLE} className="flex flex-col gap-6" onSubmit={submit}>
          {save.isError && errors.size === 0 && (
            <Alert variant="destructive">
              <AlertDescription>Não foi possível salvar a comparação padrão.</AlertDescription>
            </Alert>
          )}
          <GroupedList>
            <InputRow
              label="Valor"
              grouped
              prefix="R$"
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(typed) => {
                save.reset();
                setAmount(typed);
              }}
              message={errors.get("amount")}
            />
          </GroupedList>
          <EffectField value={effect} onChange={setEffect} />
          <DialogFooter>
            <Button type="submit" disabled={save.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * DefaultComparisonSection is Ajustes' "Início": the amount and effect Início's answer compares,
 * opening a sheet that changes them.
 */
export function DefaultComparisonSection() {
  const headerId = useId();
  const comparison = useDefaultComparison();
  const [editing, setEditing] = useState(false);

  let content: React.ReactNode;
  if (comparison.isError) {
    content = (
      <ErrorPanel
        className="min-h-0 p-8"
        title="Não foi possível carregar a comparação padrão"
        onRetry={() => void comparison.refetch()}
      />
    );
  } else if (!comparison.data) {
    content = (
      <Loading label="Carregando a comparação padrão">
        <Skeleton className="h-13" />
      </Loading>
    );
  } else {
    const { amount, effect } = comparison.data;
    content = (
      <>
        <GroupedList aria-labelledby={headerId}>
          <GroupedListItem>
            <GroupedListRow asChild>
              <button type="button" onClick={() => setEditing(true)}>
                <GroupedListLabel>{TITLE}</GroupedListLabel>
                <GroupedListValue>
                  {formatMoney(amount)} · {effectLabels[effect]}
                </GroupedListValue>
                <GroupedListChevron />
              </button>
            </GroupedListRow>
          </GroupedListItem>
        </GroupedList>
        <p className="px-4 text-footnote text-muted-foreground">
          Muda o valor e o efeito que o Início compara.
        </p>
      </>
    );
  }

  return (
    <GroupedListSection aria-labelledby={headerId}>
      <GroupedListHeader id={headerId}>Início</GroupedListHeader>
      {content}
      {editing && comparison.data && (
        <DefaultComparisonSheet comparison={comparison.data} onClose={() => setEditing(false)} />
      )}
    </GroupedListSection>
  );
}
