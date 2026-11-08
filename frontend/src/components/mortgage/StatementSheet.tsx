import { type FormEvent, useState } from "react";
import { DeleteEventDialog } from "@/components/mortgage/DeleteEventDialog";
import { Drift } from "@/components/mortgage/Drift";
import { SheetValueRow } from "@/components/mortgage/SheetFields";
import { InputRow } from "@/components/patterns/FieldRows";
import { GroupedList } from "@/components/patterns/GroupedList";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { StatementDrift } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import {
  blankStatement,
  type StatementValues,
  statementErrors,
  statementInput,
  valuesFromStatement,
} from "@/lib/mortgageEvents";
import {
  useAddStatement,
  useDeleteStatement,
  useEditStatement,
  useStatementPreview,
} from "@/lib/mortgageQueries";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

interface StatementSheetProps {
  /** The statement to edit; a new one is recorded while it is undefined. */
  statement?: StatementDrift;
  onClose: () => void;
}

/** StatementSheet records a statement, or edits or deletes one, showing its drift before saving. */
export function StatementSheet({ statement, onClose }: StatementSheetProps) {
  const [values, setValues] = useState<StatementValues>(() =>
    statement ? valuesFromStatement(statement) : blankStatement,
  );
  const add = useAddStatement();
  const edit = useEditStatement();
  const remove = useDeleteStatement();
  const save = statement ? edit : add;

  const previewInput = (typed: StatementValues) =>
    typed.date && typed.outstandingBalance.trim()
      ? { ...statementInput(typed), replaces: statement?.id }
      : undefined;
  const typed = previewInput(values);
  const preview = useStatementPreview(previewInput(useDebouncedValue(values)));
  const errors = statementErrors(save.error ?? preview.error);
  const answer = typed && !preview.isError ? preview.data : undefined;
  const stale = JSON.stringify(answer?.input) !== JSON.stringify(typed);

  function change(next: StatementValues) {
    save.reset();
    setValues(next);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const input = statementInput(values);
    if (statement) edit.mutate({ id: statement.id, input }, { onSuccess: onClose });
    else add.mutate(input, { onSuccess: onClose });
  }

  const title = statement ? "Editar extrato" : "Registrar extrato";
  const when = statement && formatDate(statement.date);
  return (
    <Dialog open onOpenChange={(open) => open || onClose()}>
      <DialogContent>
        <div className="flex flex-col gap-2">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogClose asChild>
              <Button variant="plain" size="inline">
                Cancelar
              </Button>
            </DialogClose>
          </DialogHeader>
          <DialogDescription>
            Use o saldo devedor que aparece no extrato do banco.
          </DialogDescription>
        </div>
        <form
          noValidate
          aria-label={statement ? `Editar extrato de ${when}` : title}
          className="flex flex-col gap-6"
          onSubmit={submit}
        >
          {save.isError && errors.size === 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                {statement
                  ? "Não foi possível salvar o extrato."
                  : "Não foi possível registrar o extrato."}
              </AlertDescription>
            </Alert>
          )}
          <GroupedList>
            <InputRow
              label="Data do extrato"
              type="date"
              value={values.date}
              onChange={(date) => change({ ...values, date })}
              message={errors.get("date")}
            />
            <InputRow
              label="Saldo informado"
              grouped
              prefix="R$"
              inputMode="decimal"
              placeholder="0,00"
              value={values.outstandingBalance}
              onChange={(outstandingBalance) => change({ ...values, outstandingBalance })}
              message={errors.get("outstanding_balance")}
            />
          </GroupedList>
          {answer && (
            <GroupedList
              role="status"
              aria-label="Comparação com o saldo calculado"
              aria-busy={stale}
              className="transition-opacity aria-busy:opacity-50"
            >
              <SheetValueRow label="Saldo calculado">
                {formatMoney(answer.preview.computed_balance)}
              </SheetValueRow>
              <SheetValueRow label="Diferença">
                <Drift
                  amount={answer.preview.drift}
                  withinRounding={answer.preview.within_rounding}
                />{" "}
                <span className="text-footnote text-muted-foreground">
                  ·{" "}
                  {answer.preview.within_rounding
                    ? "dentro do esperado"
                    : "acima do arredondamento"}
                </span>
              </SheetValueRow>
            </GroupedList>
          )}
          <DialogFooter>
            <Button type="submit" disabled={save.isPending}>
              {statement ? "Salvar" : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
        {statement && (
          <div className="flex flex-col gap-2">
            {remove.isError && (
              <Alert variant="destructive">
                <AlertDescription>Não foi possível excluir o extrato.</AlertDescription>
              </Alert>
            )}
            <DeleteEventDialog
              size="default"
              title="Excluir extrato?"
              description={`O extrato de ${when} será removido e a evolução do financiamento voltará a seguir o saldo calculado.`}
              onConfirm={() => remove.mutate(statement.id, { onSuccess: onClose })}
            >
              Excluir extrato
            </DeleteEventDialog>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
