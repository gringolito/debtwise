import { Link } from "@tanstack/react-router";
import { Section } from "@/components/mortgage/Section";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { MarketDataStatus } from "@/lib/api";
import { indexNames } from "@/lib/indexNames";
import { FreshnessWarning } from "@/pages/marketdata/FreshnessWarning";
import { useMarketData } from "@/pages/marketdata/useMarketData";

function isFresh({ bonds, focus, indexes }: MarketDataStatus): boolean {
  return [bonds, focus, ...indexes].every((data) => data.status === "fresh");
}

function Warnings() {
  const { status } = useMarketData();

  if (status.isPending) return <p>Verificando os dados de mercado…</p>;
  if (status.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Não foi possível verificar os dados de mercado.</AlertDescription>
      </Alert>
    );
  }
  if (isFresh(status.data)) {
    return <p className="text-muted-foreground">Dados de mercado em dia.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <FreshnessWarning
        title="Preços dos títulos"
        status={status.data.bonds}
        missing="Ainda não há preços de títulos."
      />
      <FreshnessWarning
        title="Expectativas do Focus"
        status={status.data.focus}
        missing="Ainda não há expectativas do Focus."
      />
      {status.data.indexes.map((index) => (
        <FreshnessWarning
          key={index.index}
          title={indexNames[index.index]}
          status={index}
          missing="Ainda não há dados deste índice."
        />
      ))}
      <Link to="/indices">Ver índices</Link>
    </div>
  );
}

/** MarketDataWarnings flags the market data the figures on the dashboard read that is not fresh. */
export function MarketDataWarnings() {
  return (
    <Section heading="Dados de mercado">
      <Warnings />
    </Section>
  );
}
