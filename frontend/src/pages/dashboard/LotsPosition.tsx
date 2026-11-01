import { Link } from "@tanstack/react-router";
import { Section } from "@/components/mortgage/Section";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatMoney } from "@/lib/format";
import { useLots } from "@/lib/lotQueries";
import { Figure, Figures } from "@/pages/dashboard/Figures";

function Position() {
  const { data, isPending, isError } = useLots();

  if (isPending) return <p>Carregando lotes…</p>;
  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Não foi possível carregar os lotes.</AlertDescription>
      </Alert>
    );
  }
  if (data.lots.length === 0) {
    return (
      <p className="text-muted-foreground">
        Nenhum lote registrado. <Link to="/lotes">Registrar lote</Link>.
      </p>
    );
  }
  if (!data.market_value) {
    return <p className="text-muted-foreground">Nenhum lote tem valor de mercado hoje.</p>;
  }
  return (
    <Figures>
      <Figure name="Valor de mercado líquido">{formatMoney(data.market_value.net)}</Figure>
      <Figure name="Valor de mercado bruto">{formatMoney(data.market_value.gross)}</Figure>
    </Figures>
  );
}

/** LotsPosition is what the lots held would fetch if sold today. */
export function LotsPosition() {
  return (
    <Section heading="Lotes">
      <Position />
    </Section>
  );
}
