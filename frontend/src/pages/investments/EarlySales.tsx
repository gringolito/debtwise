import { getRouteApi, Link } from "@tanstack/react-router";
import {
  GroupedList,
  GroupedListChevron,
  GroupedListItem,
  GroupedListLabel,
  GroupedListRow,
  GroupedListValue,
} from "@/components/patterns/GroupedList";
import { Loading } from "@/components/patterns/Loading";
import { ErrorPanel } from "@/components/patterns/ErrorPanel";
import type { EarlySaleCheck } from "@/lib/api";
import { bondLabel } from "@/lib/bondKinds";
import { earlySaleUnavailableLabels } from "@/lib/decisions";
import { useEarlySaleChecks } from "@/lib/earlySaleQueries";
import { formatDate } from "@/lib/format";
import {
  type EffectSearch,
  effectOf,
  effectSearch,
  marketDataOf,
  saleGain,
} from "@/lib/investments";
import { EffectControl } from "@/pages/investments/EffectControl";
import { RowsSkeleton } from "@/pages/investments/InvestmentsSkeleton";
import { SaleGainAmount } from "@/pages/investments/SaleGainAmount";
import { StaleNote } from "@/pages/marketdata/StaleNote";

const route = getRouteApi("/shell/investimentos/venda-antecipada");

const verdictWords: Record<NonNullable<EarlySaleCheck["verdict"]>, string> = {
  sell: "vender",
  hold: "manter",
};

function Outcome({ check }: { check: EarlySaleCheck }) {
  if (check.unavailable) return <>{earlySaleUnavailableLabels[check.unavailable]}</>;
  if (!check.verdict || check.advantage === undefined) return null;
  return (
    <span className="flex items-baseline gap-3">
      <SaleGainAmount gain={saleGain(check.advantage)} className="text-headline" />
      <span className="w-14 text-left">{verdictWords[check.verdict]}</span>
    </span>
  );
}

function CheckRow({ check, search }: { check: EarlySaleCheck; search: EffectSearch }) {
  const { lot } = check;
  return (
    <GroupedListItem>
      <GroupedListRow asChild>
        <Link to="/investimentos/compras/$lotId" params={{ lotId: String(lot.id) }} search={search}>
          <GroupedListLabel className="flex flex-col gap-0.5">
            <span className="text-headline">{bondLabel(lot)}</span>
            <span className="text-callout text-muted-foreground">
              Compra em {formatDate(lot.purchase_date)}
            </span>
          </GroupedListLabel>
          <GroupedListValue>
            <Outcome check={check} />
          </GroupedListValue>
          <GroupedListChevron />
        </Link>
      </GroupedListRow>
    </GroupedListItem>
  );
}

function Checks({ search }: { search: EffectSearch }) {
  const checks = useEarlySaleChecks(effectOf(search));
  if (checks.isError) {
    return (
      <ErrorPanel
        title="Não foi possível comparar suas compras"
        onRetry={() => void checks.refetch()}
      />
    );
  }
  if (!checks.isSuccess) {
    return (
      <Loading label="Comparando suas compras">
        <RowsSkeleton rows={3} />
      </Loading>
    );
  }
  const marketData = marketDataOf(checks.data.checks);
  return (
    <div className="flex flex-col gap-2">
      <GroupedList aria-label="Compras, das que mais rendem vendidas às que menos rendem">
        {checks.data.checks.map((check) => (
          <CheckRow key={check.lot.id} check={check} search={search} />
        ))}
      </GroupedList>
      <p className="px-1 text-footnote text-muted-foreground">
        Valores positivos indicam que vender e amortizar rende mais. O DebtWise compara; a decisão é
        sua.
      </p>
      {marketData && <StaleNote marketData={marketData} />}
    </div>
  );
}

/**
 * EarlySales is Venda antecipada: for every lot, what selling it today and prepaying would gain
 * over holding it to maturity, the lots most worth selling first.
 */
export function EarlySales() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-6">
        <p className="text-callout text-muted-foreground">
          Para cada compra, comparamos vender hoje e amortizar com manter até o vencimento.
        </p>
        <EffectControl
          className="shrink-0"
          value={effectOf(search)}
          onValueChange={(effect) => navigate({ search: effectSearch(effect), replace: true })}
        />
      </div>
      <Checks search={search} />
    </div>
  );
}
