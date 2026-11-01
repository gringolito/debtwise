import { Link } from "@tanstack/react-router";
import { Section } from "@/components/mortgage/Section";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api";
import { advantageText, earlySaleVerdicts } from "@/lib/decisions";
import { useEarlySaleChecks } from "@/lib/earlySaleQueries";
import { lotLabel } from "@/lib/lots";

function Best() {
  const { data, error, isPending } = useEarlySaleChecks("shorten_term");

  if (isPending) return <p>Comparando os lotes…</p>;
  if (error instanceof ApiError && error.status === 404) {
    return (
      <p className="text-muted-foreground">Cadastre o financiamento para comparar os lotes.</p>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Não foi possível comparar os lotes.</AlertDescription>
      </Alert>
    );
  }
  if (data.checks.length === 0) {
    return (
      <p className="text-muted-foreground">
        Nenhum lote registrado. <Link to="/lotes">Registrar lote</Link>.
      </p>
    );
  }

  // The API ranks the checks with a verdict first, the one selling favours most at the top.
  const [best] = data.checks;
  if (!best.verdict || !best.advantage) {
    return <p className="text-muted-foreground">Nenhum lote pode ser comparado hoje.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <p>{lotLabel(best.lot)}</p>
      <p className="text-lg font-semibold">{earlySaleVerdicts[best.verdict]}</p>
      <p>Vantagem: {advantageText(best.advantage, "manter", "vender")}</p>
      <Link to="/venda-antecipada">Ver todos os lotes</Link>
    </div>
  );
}

/** BestEarlySale is the lot selling today favours most, with its Early Sale Check's verdict. */
export function BestEarlySale() {
  return (
    <Section heading="Melhor venda antecipada">
      <Best />
    </Section>
  );
}
