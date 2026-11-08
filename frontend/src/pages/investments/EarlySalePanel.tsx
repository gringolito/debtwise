import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { EarlySaleCheck, LotValued } from "@/lib/api";
import { bondRate } from "@/lib/bondKinds";
import { earlySaleUnavailableReasons } from "@/lib/decisions";
import { useEarlySaleChecks } from "@/lib/earlySaleQueries";
import { formatDate, formatMoney } from "@/lib/format";
import { checkOf, saleGain } from "@/lib/investments";
import type { PrepaymentEffect } from "@/lib/mortgageEvents";
import { ScenarioDetails } from "@/pages/decision/ScenarioDetails";
import { Scenarios } from "@/pages/decision/Scenarios";
import { EffectControl } from "@/pages/investments/EffectControl";
import { SaleGainAmount } from "@/pages/investments/SaleGainAmount";
import { StaleNote } from "@/pages/marketdata/StaleNote";

function Verdict({ check }: { check: EarlySaleCheck }) {
  if (check.unavailable) {
    return (
      <>
        <h3 className="text-title-2">Sem comparação por enquanto</h3>
        <p className="text-body">{earlySaleUnavailableReasons[check.unavailable]}</p>
      </>
    );
  }
  if (check.advantage === undefined) return null;
  const gain = saleGain(check.advantage);
  return (
    <>
      <h3 className="text-title-2">
        {gain.kind === "gain"
          ? "Vender rende mais"
          : gain.kind === "loss"
            ? "Manter rende mais"
            : "Vender ou manter dá no mesmo"}
      </h3>
      <p className="text-body">
        {gain.kind === "even" ? (
          "Vender hoje e amortizar ficaria igual a manter até o vencimento."
        ) : (
          <>
            Vender hoje e amortizar ficaria{" "}
            <SaleGainAmount gain={gain} signed={false} className="font-semibold" />{" "}
            {gain.kind === "gain" ? "acima" : "abaixo"} de manter até o vencimento.
          </>
        )}
      </p>
    </>
  );
}

function Basis({ check }: { check: EarlySaleCheck }) {
  const { lot, sell_price: sellPrice } = check;
  return (
    <p className="text-footnote text-muted-foreground">
      Comparação até {formatDate(lot.maturity)}, com a mesma saída de dinheiro todo mês.
      {sellPrice &&
        ` O Tesouro Direto recompra hoje a ${bondRate(lot.type, sellPrice.rate)}, ${formatMoney(sellPrice.unit_price)} por título.`}
    </p>
  );
}

function Body({ lot, effect }: { lot: LotValued; effect: PrepaymentEffect }) {
  const checks = useEarlySaleChecks(effect);
  if (checks.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2">
        <p className="text-body">Não foi possível comparar a venda desta compra.</p>
        <Button variant="link" size="inline" onClick={() => void checks.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }
  if (!checks.isSuccess) {
    return (
      <div
        role="status"
        aria-label="Comparando a venda"
        aria-busy="true"
        className="flex flex-col gap-3"
      >
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-5 w-full" />
      </div>
    );
  }
  const check = checkOf(checks.data.checks, lot.id);
  if (!check) return null;
  return (
    <>
      <Verdict check={check} />
      <hr />
      <Basis check={check} />
      {check.hold && check.sell && (
        <Scenarios>
          <ScenarioDetails title="Manter" scenario={check.hold} />
          <ScenarioDetails title="Vender" scenario={check.sell} />
        </Scenarios>
      )}
    </>
  );
}

function Freshness({ lot, effect }: { lot: LotValued; effect: PrepaymentEffect }) {
  const { data } = useEarlySaleChecks(effect);
  const check = data && checkOf(data.checks, lot.id);
  return check ? <StaleNote marketData={check.market_data} /> : null;
}

/**
 * EarlySalePanel says whether selling a lot today and prepaying beats holding it to maturity, for
 * the effect the owner picks.
 */
export function EarlySalePanel({
  lot,
  effect,
  onEffectChange,
}: {
  lot: LotValued;
  effect: PrepaymentEffect;
  onEffectChange: (effect: PrepaymentEffect) => void;
}) {
  const titleId = useId();
  return (
    <div className="flex flex-col gap-2">
      <section
        aria-labelledby={titleId}
        className="flex flex-col gap-4 rounded-lg border bg-card p-6"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-footnote tracking-wide text-muted-foreground uppercase">
            Venda antecipada
          </h2>
          <EffectControl value={effect} onValueChange={onEffectChange} />
        </div>
        <Body lot={lot} effect={effect} />
      </section>
      <Freshness lot={lot} effect={effect} />
    </div>
  );
}
