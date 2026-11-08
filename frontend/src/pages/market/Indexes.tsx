import { Link } from "@tanstack/react-router";
import { ErrorPanel } from "@/components/patterns/ErrorPanel";
import {
  GroupedList,
  GroupedListChevron,
  GroupedListItem,
  GroupedListRow,
} from "@/components/patterns/GroupedList";
import { Loading } from "@/components/patterns/Loading";
import { Skeleton } from "@/components/ui/skeleton";
import type { IndexHistory, IndexName, IndexProjection } from "@/lib/api";
import { staleSources } from "@/lib/dashboard";
import { formatInstantDate } from "@/lib/format";
import { indexNames } from "@/lib/indexNames";
import { addMonths, plottedValues, seriesPoints } from "@/lib/indexSeries";
import {
  indexPeriodText,
  indexValueText,
  MORTGAGE_INDEXER_SUMMARY,
  marketIndexes,
} from "@/lib/marketIndexes";
import { useIndexSeries } from "@/lib/marketQueries";
import { useMortgage } from "@/lib/mortgageQueries";
import { StaleSourcesNote } from "@/pages/market/StaleSourcesNote";
import { Sparkline } from "@/pages/market/Sparkline";
import { useMarketData } from "@/pages/marketdata/useMarketData";

function IndexesSkeleton() {
  return (
    <Loading label="Carregando índices">
      <Skeleton className="h-5 w-96" />
      <Skeleton className="h-104" />
    </Loading>
  );
}

// A year each side of the latest value, so every row has a line to show however old its data.
const SPARKLINE_MONTHS = 12;

function IndexRow({
  index,
  history,
  projection,
  ofMortgage,
}: {
  index: IndexName;
  history: IndexHistory;
  projection?: IndexProjection;
  ofMortgage: boolean;
}) {
  const latest = history.values.at(-1);
  const points = latest
    ? seriesPoints(
        plottedValues(index, history.values),
        projection?.values ?? [],
        addMonths(latest.period_start, -SPARKLINE_MONTHS),
        addMonths(latest.period_start, SPARKLINE_MONTHS),
      )
    : [];
  // The row's parts are spans, which an accessible name would run together.
  const label = [
    indexNames[index],
    ofMortgage && "seu financiamento",
    latest
      ? `${indexValueText(index, latest.value)}, ${indexPeriodText(index, latest)}`
      : "sem dados",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <GroupedListItem>
      <GroupedListRow asChild>
        <Link to="/mercado/indices/$index" params={{ index }} aria-label={label}>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-2">
              {indexNames[index]}
              {ofMortgage && (
                <span className="rounded-full bg-accent-tint px-2 text-footnote text-accent">
                  Seu financiamento
                </span>
              )}
            </span>
            <span className="text-callout text-muted-foreground">
              {ofMortgage ? MORTGAGE_INDEXER_SUMMARY : marketIndexes[index].summary}
            </span>
          </span>
          <Sparkline points={points} />
          <span className="flex w-52 flex-col items-end gap-0.5 text-right">
            {latest ? (
              <>
                <span className="tabular-nums">{indexValueText(index, latest.value)}</span>
                <span className="text-footnote text-muted-foreground">
                  {indexPeriodText(index, latest)}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">Sem dados</span>
            )}
          </span>
          <GroupedListChevron />
        </Link>
      </GroupedListRow>
    </GroupedListItem>
  );
}

/** Indexes is Mercado's Índices: each index with its latest value, the mortgage's marked. */
export function Indexes() {
  const { status } = useMarketData();
  const indexer = useMortgage().data?.indexer;
  const statuses = status.data?.indexes ?? [];
  const { histories, projections } = useIndexSeries(statuses.map((s) => s.index));

  const failed = [status, ...histories].filter((query) => query.isError);
  if (failed.length > 0) {
    return (
      <ErrorPanel
        title="Não foi possível carregar os índices"
        onRetry={() => {
          for (const query of failed) void query.refetch();
        }}
      />
    );
  }
  if (!status.data || histories.some((h) => !h.data) || projections.some((p) => p.isLoading)) {
    return <IndexesSkeleton />;
  }

  const { focus } = status.data;
  const updated = [...statuses, focus]
    .map((s) => s.refreshed_at)
    .filter((instant) => instant !== undefined)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];

  return (
    <div className="flex flex-col gap-4">
      {updated && (
        <p className="text-callout text-muted-foreground">
          Dados do Banco Central e do IBGE. Atualizados em {formatInstantDate(updated)}.
        </p>
      )}
      <StaleSourcesNote sources={staleSources({ focus, indexes: statuses })} />
      <GroupedList aria-label="Índices">
        {statuses.map(({ index }, i) => (
          <IndexRow
            key={index}
            index={index}
            history={histories[i].data as IndexHistory}
            projection={projections[i].data}
            ofMortgage={index === indexer}
          />
        ))}
      </GroupedList>
    </div>
  );
}
