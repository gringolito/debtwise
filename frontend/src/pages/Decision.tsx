import { getRouteApi, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api";
import { blankDecision, decisionErrors, decisionInput } from "@/lib/decisions";
import { useDecide } from "@/lib/decisionQueries";
import { moneyToInput } from "@/lib/format";
import { DecisionForm } from "@/pages/decision/DecisionForm";
import { VerdictList } from "@/pages/decision/VerdictList";

const route = getRouteApi("/shell/decidir");

export function Decision() {
  const { valor, comparar } = route.useSearch();
  const initialAmount = valor === undefined ? "" : moneyToInput(String(valor));
  const decide = useDecide();
  const errors = decisionErrors(decide.error);
  const noMortgage = decide.error instanceof ApiError && decide.error.status === 404;
  const failed = decide.isError && errors.size === 0 && !noMortgage;

  const compared = useRef(false);
  const { mutate } = decide;
  useEffect(() => {
    if (compared.current || !comparar || initialAmount === "") return;
    compared.current = true;
    mutate(decisionInput({ ...blankDecision, amount: initialAmount }));
  }, [comparar, initialAmount, mutate]);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-title-2">Decisão</h2>
      <DecisionForm
        onSubmit={decide.mutate}
        pending={decide.isPending}
        errors={errors}
        failure={failed ? "Não foi possível comparar." : null}
        initialAmount={initialAmount}
      />
      {noMortgage && (
        <Alert variant="warning">
          <AlertDescription>
            Nenhum financiamento cadastrado.{" "}
            <Link to="/financiamento/editar">Cadastrar financiamento</Link>.
          </AlertDescription>
        </Alert>
      )}
      {decide.data && <VerdictList decision={decide.data} />}
    </div>
  );
}
