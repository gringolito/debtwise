import { Section } from "@/components/mortgage/Section";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Decision, Verdict } from "@/lib/api";
import { bondKinds, bondRate } from "@/lib/bondKinds";
import { advantageText, breakEvenText, noBreakEvenText, unavailableReasons } from "@/lib/decisions";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { projectedByText } from "@/lib/projectionMethods";
import { MarketDataFreshness } from "@/pages/decision/MarketDataFreshness";
import { ScenarioDetails } from "@/pages/decision/ScenarioDetails";
import { Scenarios } from "@/pages/decision/Scenarios";

function verdictTitle({ type, maturity }: Verdict): string {
  return `${bondKinds[type].name} ${maturity.slice(0, 4)}`;
}

function VerdictCard({ verdict }: { verdict: Verdict }) {
  return (
    <Section heading={verdictTitle(verdict)}>
      <div className="flex flex-col gap-4">
        <p>
          Vencimento (horizonte) {formatDate(verdict.maturity)} · Taxa{" "}
          {bondRate(verdict.type, verdict.rate)}
          {verdict.unit_price && ` · Preço ${formatMoney(verdict.unit_price)}`}
          {verdict.quantity && ` · Quantidade ${formatNumber(verdict.quantity)}`}
        </p>
        {verdict.unavailable && (
          <Alert variant="warning">
            <AlertDescription>{unavailableReasons[verdict.unavailable]}</AlertDescription>
          </Alert>
        )}
        {verdict.advantage && (
          <p className="text-lg font-semibold">
            Vantagem: {advantageText(verdict.advantage, "investir", "amortizar")}
          </p>
        )}
        {verdict.avoided_cost && (
          <p>Custo evitado ao amortizar: {formatMoney(verdict.avoided_cost)}</p>
        )}
        {verdict.break_even_rate && (
          <p>{breakEvenText(verdict.type, verdict.rate, verdict.break_even_rate)}</p>
        )}
        {verdict.no_break_even && <p>{noBreakEvenText(verdict.type, verdict.no_break_even)}</p>}
        <p>
          {verdict.projected_by.length === 0
            ? "Somente valores publicados."
            : `Valores projetados — ${projectedByText(verdict.projected_by)}`}
        </p>
        <MarketDataFreshness marketData={verdict.market_data} />
        {verdict.invest && verdict.prepay && (
          <Scenarios>
            <ScenarioDetails title="Investir" scenario={verdict.invest} />
            <ScenarioDetails title="Amortizar" scenario={verdict.prepay} />
          </Scenarios>
        )}
      </div>
    </Section>
  );
}

export function VerdictList({ decision }: { decision: Decision }) {
  return (
    <>
      <p className="text-muted-foreground">Comparação em {formatDate(decision.date)}</p>
      {decision.verdicts.length === 0 ? (
        <p className="text-muted-foreground">
          Nenhum título à venda acompanha o indexador do financiamento.
        </p>
      ) : (
        decision.verdicts.map((verdict) => (
          <VerdictCard key={`${verdict.type}-${verdict.maturity}`} verdict={verdict} />
        ))
      )}
    </>
  );
}
