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

/** Outcome says in words which option earns more over holding to maturity, and by how much. */
function Outcome({ check }: { check: EarlySaleCheck }) {
  if (check.unavailable) {
    return <span className="text-callout">{earlySaleUnavailableLabels[check.unavailable]}</span>;
  }
  if (!check.verdict || check.advantage === undefined) return null;
  const gain = saleGain(check.advantage);
  return (
    <>
      <span className="text-callout font-medium text-foreground">
        {gain.kind === "even" ? (
          "Vender e manter rendem o mesmo"
        ) : (
          <>
            {gain.kind === "gain" ? "Vender" : "Manter"} rende <SaleGainAmount gain={gain} /> a mais
          </>
        )}
      </span>
      <span className="text-callout">até {formatDate(check.lot.maturity)}</span>
    </>
  );
}

/** CheckRow is one lot: the bond and purchase, with the outcome beside them, under them on phones. */
function CheckRow({ check, search }: { check: EarlySaleCheck; search: EffectSearch }) {
  const { lot } = check;
  return (
    <GroupedListItem>
      <GroupedListRow asChild>
        <Link to="/investimentos/compras/$lotId" params={{ lotId: String(lot.id) }} search={search}>
          <GroupedListLabel className="flex flex-col gap-x-4 gap-y-1 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex flex-col gap-0.5">
              <span className="text-headline">{bondLabel(lot)}</span>
              <span className="text-callout text-muted-foreground">
                Compra em {formatDate(lot.purchase_date)}
              </span>
            </span>
            <GroupedListValue className="flex flex-col gap-0.5 text-left sm:shrink-0 sm:text-right">
              <Outcome check={check} />
            </GroupedListValue>
          </GroupedListLabel>
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
        Cada compra mostra a opção que rende mais até o vencimento. O DebtWise compara; a decisão é
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p className="text-callout text-muted-foreground">
          Para cada compra, comparamos vender hoje e amortizar com manter até o vencimento.
        </p>
        <EffectControl
          className="sm:shrink-0"
          value={effectOf(search)}
          onValueChange={(effect) => navigate({ search: effectSearch(effect), replace: true })}
        />
      </div>
      <Checks search={search} />
    </div>
  );
}
