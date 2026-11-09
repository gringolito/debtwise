import { KeyFigure, KeyFigures } from "@/components/mortgage/KeyFigures";
import { ErrorPanel } from "@/components/patterns/ErrorPanel";
import {
  GroupedList,
  GroupedListChevron,
  GroupedListItem,
  GroupedListLabel,
  GroupedListRow,
  GroupedListValue,
} from "@/components/patterns/GroupedList";
import { Loading } from "@/components/patterns/Loading";
import { Skeleton } from "@/components/ui/skeleton";
import type { PrepaymentOutcome } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { effectLabels } from "@/lib/mortgageEvents";
import { isZero } from "@/lib/decisions";
import { usePrepayments } from "@/lib/mortgageQueries";

const months = (count: number) => (count === 1 ? "1 mês" : `${count} meses`);

function outcomeText(prepayment: PrepaymentOutcome): string {
  if (prepayment.effect === "shorten_term" && prepayment.months_shortened > 0) {
    return `Reduziu o prazo em ${months(prepayment.months_shortened)}`;
  }
  if (prepayment.effect === "lower_installment" && !isZero(prepayment.installment_reduction)) {
    return `Reduziu a prestação em ${formatMoney(prepayment.installment_reduction)}`;
  }
  return effectLabels[prepayment.effect];
}

interface PrepaymentsProps {
  onEdit: (prepayment: PrepaymentOutcome) => void;
}

/** Prepayments is what the prepayments took off and changed, each one opening to edit it. */
export function Prepayments({ onEdit }: PrepaymentsProps) {
  const { data, isPending, isError, refetch } = usePrepayments();

  if (isPending) {
    return (
      <Loading label="Carregando amortizações">
        <Skeleton className="h-28" />
        <Skeleton className="h-40" />
      </Loading>
    );
  }
  if (isError) {
    return (
      <ErrorPanel
        title="Não foi possível carregar as amortizações"
        onRetry={() => void refetch()}
      />
    );
  }
  if (data.prepayments.length === 0) {
    return (
      <p className="rounded-lg glass px-6 py-10 text-center text-callout text-muted-foreground">
        Nenhuma amortização registrada.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <KeyFigures>
        <KeyFigure name="Total amortizado">{formatMoney(data.total_amount)}</KeyFigure>
        <KeyFigure name="Prazo reduzido">{months(data.months_shortened)}</KeyFigure>
      </KeyFigures>
      <GroupedList aria-label="Amortizações registradas">
        {data.prepayments.toReversed().map((prepayment) => (
          <GroupedListItem key={prepayment.id}>
            <GroupedListRow asChild>
              <button
                type="button"
                aria-label={`Editar amortização de ${formatDate(prepayment.date)}`}
                onClick={() => onEdit(prepayment)}
              >
                <GroupedListLabel className="flex flex-col">
                  <span className="text-headline">{formatDate(prepayment.date)}</span>{" "}
                  <span className="text-callout text-muted-foreground">
                    {outcomeText(prepayment)}
                  </span>
                </GroupedListLabel>{" "}
                <GroupedListValue className="text-headline text-foreground">
                  {formatMoney(prepayment.amount)}
                </GroupedListValue>
                <GroupedListChevron />
              </button>
            </GroupedListRow>
          </GroupedListItem>
        ))}
      </GroupedList>
    </div>
  );
}
