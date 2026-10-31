import { Link } from "@tanstack/react-router";
import { AmountRow, AmountsHeader } from "@/components/lots/LotValuesTables";
import { Section } from "@/components/mortgage/Section";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody } from "@/components/ui/table";
import type { EarlySaleCheck, EarlySaleCheckList } from "@/lib/api";
import { bondRate } from "@/lib/bondKinds";
import { advantageText, earlySaleUnavailableReasons, earlySaleVerdicts } from "@/lib/decisions";
import { formatDate, formatMoney } from "@/lib/format";
import { lotLabel } from "@/lib/lots";
import { projectedByText } from "@/lib/projectionMethods";
import { MarketDataFreshness } from "@/pages/decision/MarketDataFreshness";
import { ScenarioDetails } from "@/pages/decision/ScenarioDetails";
import { Scenarios } from "@/pages/decision/Scenarios";

function EarlySaleCard({ check }: { check: EarlySaleCheck }) {
  const { lot, sell_price: sellPrice } = check;
  const label = lotLabel(lot);
  return (
    <Section heading={label}>
      <div className="flex flex-col gap-4">
        <p>
          Vencimento (horizonte) {formatDate(lot.maturity)}
          {sellPrice &&
            ` · Taxa de venda ${bondRate(lot.type, sellPrice.rate)} · Preço de venda ${formatMoney(sellPrice.unit_price)}`}
        </p>
        {check.unavailable && (
          <Alert variant="warning">
            <AlertDescription>{earlySaleUnavailableReasons[check.unavailable]}</AlertDescription>
          </Alert>
        )}
        {check.verdict && (
          <p className="text-lg font-semibold">{earlySaleVerdicts[check.verdict]}</p>
        )}
        {check.advantage && <p>Vantagem: {advantageText(check.advantage, "manter", "vender")}</p>}
        {check.market_value && check.hold?.bond && (
          <Table aria-label={`Valores de ${label}`}>
            <AmountsHeader />
            <TableBody>
              <AmountRow name="Valor de mercado (venda hoje)" amount={check.market_value} />
              <AmountRow name="Valor no vencimento" amount={check.hold.bond} />
            </TableBody>
          </Table>
        )}
        <p>
          {check.projected_by.length === 0
            ? "Somente valores publicados."
            : `Valores projetados — ${projectedByText(check.projected_by)}`}
        </p>
        <MarketDataFreshness marketData={check.market_data} />
        {check.hold && check.sell && (
          <Scenarios>
            <ScenarioDetails title="Manter" scenario={check.hold} />
            <ScenarioDetails title="Vender" scenario={check.sell} />
          </Scenarios>
        )}
      </div>
    </Section>
  );
}

/** EarlySaleList shows the early sale check of every lot, in the order the API ranks them. */
export function EarlySaleList({ list }: { list: EarlySaleCheckList }) {
  if (list.checks.length === 0) {
    return (
      <p className="text-muted-foreground">
        Nenhum lote registrado. <Link to="/lotes">Registrar lote</Link>.
      </p>
    );
  }
  return (
    <>
      <p className="text-muted-foreground">
        Venda em {formatDate(list.date)}, lotes do mais ao menos favorável à venda
      </p>
      {list.checks.map((check) => (
        <EarlySaleCard key={check.lot.id} check={check} />
      ))}
    </>
  );
}
