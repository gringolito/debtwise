import { useId } from "react";
import { GroupedList, GroupedListItem, GroupedListRow } from "@/components/patterns/GroupedList";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useDeleteMortgage } from "@/lib/mortgageQueries";

/**
 * DeleteMortgage deletes the mortgage, with its prepayments and statements, once the owner
 * confirms. The lots stay. With no mortgage left, the app opens the onboarding.
 */
export function DeleteMortgage() {
  const remove = useDeleteMortgage();
  const errorId = useId();
  return (
    <div className="flex flex-col gap-2">
      <AlertDialog>
        <GroupedList>
          <GroupedListItem>
            <AlertDialogTrigger asChild>
              <GroupedListRow asChild>
                <button
                  type="button"
                  disabled={remove.isPending}
                  aria-describedby={remove.isError ? errorId : undefined}
                  className="justify-center text-destructive disabled:opacity-50"
                >
                  Excluir financiamento
                </button>
              </GroupedListRow>
            </AlertDialogTrigger>
          </GroupedListItem>
        </GroupedList>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <span aria-hidden="true">!</span>
            </AlertDialogMedia>
            <AlertDialogTitle>Excluir financiamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O contrato, as amortizações e os extratos registrados serão apagados. Suas compras de
              títulos continuam.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction variant="critical" onClick={() => remove.mutate()}>
              Excluir
            </AlertDialogAction>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {remove.isError && (
        <p id={errorId} role="alert" className="px-4 text-footnote text-destructive">
          Não foi possível excluir o financiamento.
        </p>
      )}
    </div>
  );
}
