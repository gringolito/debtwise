import { getRouteApi } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Page, PageHeader, PageTitle } from "@/components/layout/Page";
import { ErrorPanel } from "@/components/patterns/ErrorPanel";
import { Loading } from "@/components/patterns/Loading";
import { Skeleton } from "@/components/ui/skeleton";
import { blankDecision, decisionErrors, decisionInput } from "@/lib/decisions";
import { useDecide } from "@/lib/decisionQueries";
import { moneyToInput } from "@/lib/format";
import { Comparison } from "@/pages/decision/Comparison";
import { DecisionSentence } from "@/pages/decision/DecisionSentence";

const route = getRouteApi("/shell/comparar");

function ComparisonSkeleton() {
  return (
    <Loading label="Comparando">
      <div className="flex flex-col gap-6 rounded-lg glass p-5 sm:p-8">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-72 max-w-full" />
          <Skeleton className="h-5 w-56 max-w-full" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-52 w-full" />
        </div>
        <Skeleton className="h-7 w-64 max-w-full" />
      </div>
    </Loading>
  );
}

/** Decision is Comparar: amortizar ou investir, compared for the amount, date and effect asked. */
export function Decision() {
  const { valor, comparar } = route.useSearch();
  const [values, setValues] = useState(() => ({
    ...blankDecision,
    amount: valor === undefined ? "" : moneyToInput(String(valor)),
  }));
  const decide = useDecide();
  const errors = decisionErrors(decide.error);
  const { mutate } = decide;

  const arrived = useRef(false);
  useEffect(() => {
    if (arrived.current || !comparar || values.amount === "") return;
    arrived.current = true;
    mutate(decisionInput(values));
  }, [comparar, values, mutate]);

  function compareAmount(amount: string) {
    const next = { ...values, amount: moneyToInput(amount) };
    setValues(next);
    mutate(decisionInput(next));
  }

  return (
    <Page>
      <PageHeader className="flex-col items-start gap-1">
        <PageTitle>Comparar</PageTitle>
        <p className="text-callout text-muted-foreground">
          Amortizar ou investir? Compare usando o mesmo dinheiro.
        </p>
      </PageHeader>
      <div className="flex flex-col gap-6">
        <DecisionSentence
          values={values}
          onChange={setValues}
          onSubmit={() => mutate(decisionInput(values))}
          pending={decide.isPending}
          errors={errors}
        />
        {decide.isPending && <ComparisonSkeleton />}
        {decide.isError && errors.size === 0 && (
          <ErrorPanel
            title="Não foi possível comparar"
            onRetry={() => decide.variables && mutate(decide.variables)}
          />
        )}
        {decide.data && (
          <Comparison key={decide.submittedAt} decision={decide.data} onUseAmount={compareAmount} />
        )}
      </div>
    </Page>
  );
}
