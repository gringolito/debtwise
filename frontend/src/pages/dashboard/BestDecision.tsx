import { Link } from "@tanstack/react-router";
import { Section } from "@/components/mortgage/Section";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError, type Decision } from "@/lib/api";
import { bestVerdict } from "@/lib/dashboard";
import { useDecide } from "@/lib/decisionQueries";
import {
  advantageText,
  breakEvenText,
  decisionErrors,
  noBreakEvenText,
  verdictTitle,
} from "@/lib/decisions";
import { BalanceChart } from "@/pages/dashboard/BalanceChart";
import { DecisionForm } from "@/pages/decision/DecisionForm";

function Best({ decision }: { decision: Decision }) {
  if (decision.verdicts.length === 0) {
    return (
      <p className="text-muted-foreground">
        Nenhum título à venda acompanha o indexador do financiamento.
      </p>
    );
  }
  const best = bestVerdict(decision.verdicts);
  if (!best?.advantage) {
    return (
      <p className="text-muted-foreground">Nenhum título pôde ser comparado com esse valor.</p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p>{verdictTitle(best)}</p>
      <p className="text-lg font-semibold">
        Vantagem: {advantageText(best.advantage, "investir", "amortizar")}
      </p>
      {best.break_even_rate && <p>{breakEvenText(best.type, best.rate, best.break_even_rate)}</p>}
      {best.no_break_even && <p>{noBreakEvenText(best.type, best.no_break_even)}</p>}
      {best.invest && best.prepay && (
        <BalanceChart invest={best.invest} prepay={best.prepay} className="h-64 w-full" />
      )}
      <Link to="/decisao">Ver todos os títulos</Link>
    </div>
  );
}

/**
 * BestDecision compares an amount the owner types with every bond on offer and shows the verdict
 * of the highest Advantage, with the Outstanding Balance of its scenarios over time.
 */
export function BestDecision() {
  const decide = useDecide();
  const errors = decisionErrors(decide.error);
  const noMortgage = decide.error instanceof ApiError && decide.error.status === 404;
  const failed = decide.isError && errors.size === 0 && !noMortgage;

  return (
    <Section heading="Melhor decisão">
      <div className="flex flex-col gap-4">
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
        {decide.data && <Best decision={decide.data} />}
      </div>
    </Section>
  );
}
