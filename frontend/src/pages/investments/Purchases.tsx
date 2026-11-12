import { Link } from "@tanstack/react-router";
import { CalendarClockIcon, TrendingUpIcon } from "lucide-react";
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
import { bondLabel, bondRate } from "@/lib/bondKinds";
import { today } from "@/lib/dashboard";
import { useEarlySaleChecks } from "@/lib/earlySaleQueries";
import { formatDate, formatMoney } from "@/lib/format";
import { checkOf, inMaturityOrder, leftOutOfMarketTotal, saleGain } from "@/lib/investments";
import { useLots } from "@/lib/lotQueries";
import { SaleGainAmount } from "@/pages/investments/SaleGainAmount";

/** SaleSummary says how many lots would earn more sold and prepaid, and links to the comparison. */
function SaleSummary({ checks }: { checks: EarlySaleCheck[] }) {
  const selling = checks.filter((check) => check.verdict === "sell").length;
  if (selling === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-callout text-muted-foreground">
      <span>
        {selling === 1
          ? "1 compra renderia mais vendida para amortizar."
          : `${selling} compras renderiam mais vendidas para amortizar.`}
      </span>
      <Link
        to="/investimentos/venda-antecipada"
        className="inline-flex items-center font-medium text-accent hover:underline max-sm:min-h-11"
      >
        Ver venda antecipada
      </Link>
    </p>
  );
}

function MarketTotal({
  lots: { lots, market_value },
  checks,
}: {
  lots: LotList;
  checks: EarlySaleCheck[];
}) {
  const titleId = useId();
  const leftOut = leftOutOfMarketTotal(lots, today());
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4 rounded-lg glass p-6">
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="text-footnote tracking-wide text-muted-foreground uppercase">
          Valor de mercado
        </h2>
        {market_value ? (
          <>
            <p className="text-hero-figure tabular-nums">{formatMoney(market_value.net)}</p>
            <p className="text-callout text-muted-foreground">Líquido, se vender tudo hoje</p>
            <SaleSummary checks={checks} />
          </>
        ) : (
          <p className="text-callout text-muted-foreground">
            Nenhuma compra tem valor de mercado hoje.
          </p>
        )}
      </div>
      {market_value && (
        <dl className="flex flex-wrap gap-x-10 gap-y-2 border-t border-border pt-4">
          {[
            ["Bruto", formatMoney(market_value.gross)],
            ["IR", `− ${formatMoney(market_value.income_tax)}`],
            ["IOF", `− ${formatMoney(market_value.iof)}`],
            ["Custódia", `− ${formatMoney(market_value.custody_fee)}`],
          ].map(([name, amount]) => (
            <div key={name} className="flex flex-col gap-0.5">
              <dt className="text-footnote text-muted-foreground">{name}</dt>{" "}
              <dd className="text-callout tabular-nums">{amount}</dd>{" "}
            </div>
          ))}
        </dl>
      )}
      {market_value && leftOut > 0 && (
        <p className="text-footnote text-muted-foreground">
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

/** SaleHint says whether selling the lot early and prepaying beats holding it, with a glyph. */
function SaleHint({ check }: { check: EarlySaleCheck | undefined }) {
  if (check?.verdict === "sell" && check.advantage !== undefined) {
    return (
      <span className="flex items-start gap-1.5 text-callout">
        <TrendingUpIcon
          aria-hidden="true"
          strokeWidth={1.75}
          className="mt-0.5 size-4 shrink-0 text-positive"
        />
        <span>
          Vender e amortizar rende{" "}
          <span className="whitespace-nowrap">
            <SaleGainAmount gain={saleGain(check.advantage)} /> a mais
          </span>
        </span>
      </span>
    );
  }
  if (check?.verdict === "hold") {
    return (
      <span className="flex items-start gap-1.5 text-callout text-muted-foreground">
        <CalendarClockIcon
          aria-hidden="true"
          strokeWidth={1.75}
          className="mt-0.5 size-4 shrink-0"
        />
        <span>Manter até o vencimento</span>
      </span>
    );
  }
  return null;
}

/**
 * LotRow is one lot: the bond and its net value on the first line (the value drops under a bond
 * name too long to share it), the purchase below, then the sale hint.
 */
function LotRow({ lot, check }: { lot: LotValued; check: EarlySaleCheck | undefined }) {
  const figure = marketFigure(lot);
  return (
    <GroupedListItem>
      <GroupedListRow asChild>
        <Link to="/investimentos/compras/$lotId" params={{ lotId: String(lot.id) }}>
          <GroupedListLabel className="flex flex-col gap-0.5">
            <span className="flex flex-wrap items-baseline justify-between gap-x-4">
              <span className="text-headline">{bondLabel(lot)}</span>
              <GroupedListValue
                className={
                  figure.muted
                    ? "ml-auto text-callout whitespace-nowrap"
                    : "ml-auto text-headline font-semibold whitespace-nowrap text-foreground tabular-nums"
                }
              >
                {figure.text}
              </GroupedListValue>
            </span>
            <span className="text-callout text-muted-foreground">
              Compra em {formatDate(lot.purchase_date)} · {bondRate(lot.type, lot.rate)}
            </span>
            <SaleHint check={check} />
          </GroupedListLabel>
          <GroupedListChevron />
        </Link>
      </GroupedListRow>
    </GroupedListItem>
  );
}

/** Purchases is Compras: the lots' total Market Value, then every lot in one list. */
export function Purchases() {
  const { data } = useLots();
  const checks = useEarlySaleChecks("shorten_term");
  if (!data) return null;
  const listed = checks.data?.checks ?? [];
  return (
    <div className="flex flex-col gap-6">
      <MarketTotal lots={data} checks={listed} />
      <GroupedListSection aria-label="Compras">
        <GroupedList>
          {inMaturityOrder(data.lots).map((lot) => (
            <LotRow key={lot.id} lot={lot} check={checkOf(listed, lot.id)} />
          ))}
        </GroupedList>
        <p className="px-1 text-footnote text-muted-foreground">
          Cada compra em uma data diferente aparece separada.
        </p>
      </GroupedListSection>
    </div>
  );
}
