import { Link } from "@tanstack/react-router";
import { useId } from "react";
import {
  GroupedList,
  GroupedListChevron,
  GroupedListItem,
  GroupedListLabel,
  GroupedListRow,
  GroupedListSection,
  GroupedListValue,
} from "@/components/patterns/GroupedList";
import type { EarlySaleCheck, LotList, LotValued } from "@/lib/api";
import { bondRate } from "@/lib/bondKinds";
import { today } from "@/lib/dashboard";
import { useEarlySaleChecks } from "@/lib/earlySaleQueries";
import { formatDate, formatMoney } from "@/lib/format";
import { checkOf, groupByBond, leftOutOfMarketTotal, saleGain } from "@/lib/investments";
import { useLots } from "@/lib/lotQueries";
import { SaleGainAmount } from "@/pages/investments/SaleGainAmount";

function MarketTotal({ lots: { lots, market_value } }: { lots: LotList }) {
  const titleId = useId();
  const leftOut = leftOutOfMarketTotal(lots, today());
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-1 rounded-lg border bg-card p-6"
    >
      <h2 id={titleId} className="text-footnote tracking-wide text-muted-foreground uppercase">
        Valor de mercado líquido
      </h2>
      {market_value ? (
        <>
          <p className="text-hero-figure tabular-nums">{formatMoney(market_value.net)}</p>
          <p className="text-callout text-muted-foreground">
            Bruto {formatMoney(market_value.gross)} · já descontados IR, IOF e custódia
          </p>
        </>
      ) : (
        <p className="text-callout text-muted-foreground">
          Nenhuma compra tem valor de mercado hoje.
        </p>
      )}
      {market_value && leftOut > 0 && (
        <p className="mt-2 text-footnote text-muted-foreground">
          {leftOut === 1
            ? "1 compra sem valor de mercado ficou fora do total."
            : `${leftOut} compras sem valor de mercado ficaram fora do total.`}
        </p>
      )}
    </section>
  );
}

/** marketFigure is what a lot's row shows as its value: its net Market Value, or why it has none. */
function marketFigure(lot: LotValued): { text: string; muted: boolean } {
  if (lot.values_unavailable === "missing_ipca") return { text: "Aguardando o IPCA", muted: true };
  if (lot.values?.market) return { text: formatMoney(lot.values.market.net), muted: false };
  if (!lot.values?.accrual) return { text: "Vencido", muted: true };
  return { text: "Sem preço de venda", muted: true };
}

function SaleHint({ check }: { check: EarlySaleCheck | undefined }) {
  if (check?.verdict === "hold") return <>Manter até o vencimento</>;
  if (check?.verdict === "sell" && check.advantage !== undefined) {
    return (
      <>
        Vender e amortizar renderia <SaleGainAmount gain={saleGain(check.advantage)} />
      </>
    );
  }
  return null;
}

function LotRow({ lot, check }: { lot: LotValued; check: EarlySaleCheck | undefined }) {
  const figure = marketFigure(lot);
  const hint = check?.verdict ? <SaleHint check={check} /> : null;
  return (
    <GroupedListItem>
      <GroupedListRow asChild>
        <Link to="/investimentos/compras/$lotId" params={{ lotId: String(lot.id) }}>
          <GroupedListLabel className="flex flex-col gap-0.5">
            <span>Compra em {formatDate(lot.purchase_date)}</span>
            <span className="text-callout text-muted-foreground">
              {bondRate(lot.type, lot.rate)}
            </span>
            {hint && <span className="text-footnote text-muted-foreground">{hint}</span>}
          </GroupedListLabel>
          <GroupedListValue
            className={figure.muted ? "text-callout" : "font-semibold text-foreground tabular-nums"}
          >
            {figure.text}
          </GroupedListValue>
          <GroupedListChevron />
        </Link>
      </GroupedListRow>
    </GroupedListItem>
  );
}

/** Purchases is Compras: the lots' total Market Value, then each lot under its bond. */
export function Purchases() {
  const { data } = useLots();
  const checks = useEarlySaleChecks("shorten_term");
  if (!data) return null;
  const listed = checks.data?.checks ?? [];
  return (
    <div className="flex flex-col gap-10">
      <MarketTotal lots={data} />
      {groupByBond(data.lots).map((group) => (
        <GroupedListSection key={group.label} aria-label={group.label}>
          <h2 className="px-1 text-headline">{group.label}</h2>
          <GroupedList>
            {group.lots.map((lot) => (
              <LotRow key={lot.id} lot={lot} check={checkOf(listed, lot.id)} />
            ))}
          </GroupedList>
        </GroupedListSection>
      ))}
      <p className="-mt-6 px-1 text-footnote text-muted-foreground">
        Cada compra em uma data diferente aparece separada.
      </p>
    </div>
  );
}
