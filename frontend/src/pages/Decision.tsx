import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api";
import { decisionErrors } from "@/lib/decisions";
import { useDecide } from "@/lib/decisionQueries";
import { DecisionForm } from "@/pages/decision/DecisionForm";
import { VerdictList } from "@/pages/decision/VerdictList";

export function Decision() {
  const decide = useDecide();
  const errors = decisionErrors(decide.error);
  const noMortgage = decide.error instanceof ApiError && decide.error.status === 404;
  const failed = decide.isError && errors.size === 0 && !noMortgage;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Decisão</h2>
      <DecisionForm
        onSubmit={decide.mutate}
        pending={decide.isPending}
        errors={errors}
        failure={failed ? "Não foi possível comparar." : null}
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
