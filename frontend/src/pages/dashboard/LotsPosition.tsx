import { Link } from "@tanstack/react-router";
import { Section } from "@/components/mortgage/Section";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { today } from "@/lib/dashboard";
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
  const date = today();
  const leftOut = data.lots.filter((lot) => !lot.values?.market && lot.maturity > date).length;
  return (
    <div className="flex flex-col gap-2">
      <Figures>
        <Figure name="Valor de mercado líquido">{formatMoney(data.market_value.net)}</Figure>
        <Figure name="Valor de mercado bruto">{formatMoney(data.market_value.gross)}</Figure>
      </Figures>
      {leftOut > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            {leftOut === 1
              ? "1 lote sem valor de mercado ficou fora do total."
              : `${leftOut} lotes sem valor de mercado ficaram fora do total.`}
          </AlertDescription>
        </Alert>
      )}
    </div>
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
