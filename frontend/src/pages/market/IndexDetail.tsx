import { getRouteApi, Link } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";
import { Page, PageHeader, PageTitle } from "@/components/layout/Page";
import { ErrorPanel } from "@/components/patterns/ErrorPanel";
import { Loading } from "@/components/patterns/Loading";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { IndexHistory, IndexName, IndexProjection, ProjectionMethods } from "@/lib/api";
import { staleSources, today } from "@/lib/dashboard";
import { indexNames } from "@/lib/indexNames";
import { indexPeriodProse, indexValueText, marketIndexes } from "@/lib/marketIndexes";
import { useIndexHistory, useIndexProjection, useProjectionMethods } from "@/lib/marketQueries";
import { IndexChart } from "@/pages/market/IndexChart";
import { PoupancaDerivation, ProjectionSummary } from "@/pages/market/Projection";
import { StaleSourcesNote } from "@/pages/marketdata/StaleSourcesNote";
import { useMarketData } from "@/pages/marketdata/useMarketData";

const route = getRouteApi("/shell/mercado/indices/$index");

function DetailSkeleton() {
  return (
    <Loading label="Carregando índice">
      <Skeleton className="h-36" />
      <Skeleton className="h-96" />
      <Skeleton className="h-60" />
    </Loading>
  );
}

function Detail({
  index,
  history,
  projection,
  methods,
}: {
  index: IndexName;
  history: IndexHistory;
  projection?: IndexProjection;
  methods: ProjectionMethods;
}) {
  const status = useMarketData().status.data;
  const latest = history.values.at(-1);
  const chosen = methods.methods.find((m) => m.index === index);
  const sources = staleSources({
    focus: chosen?.method === "focus" ? status?.focus : undefined,
    indexes: status?.indexes.filter((s) => s.index === index),
  });

  return (
    <>
      <div className="flex flex-col gap-2">
        <section aria-label="Último valor" className="rounded-lg glass p-6">
          {latest ? (
            <>
              <p className="text-hero-figure tabular-nums">{indexValueText(index, latest.value)}</p>
              <p className="text-callout text-muted-foreground">
                {indexPeriodProse(index, latest)}
              </p>
            </>
          ) : (
            <p className="text-callout text-muted-foreground">Ainda não há valores deste índice.</p>
          )}
        </section>
        <StaleSourcesNote sources={sources} />
      </div>
      {latest && (
        <IndexChart
          index={index}
          values={history.values}
          projection={projection?.values ?? []}
          today={today()}
        />
      )}
      {index === "poupanca_yield" ? (
        <PoupancaDerivation methods={methods.methods} />
      ) : (
        chosen && <ProjectionSummary projection={chosen} />
      )}
    </>
  );
}

/** IndexDetail is one index: its latest value, its history and projection, and how it is projected. */
export function IndexDetail() {
  const index = route.useParams({ select: (params) => params.index as IndexName });
  const history = useIndexHistory(index);
  const projection = useIndexProjection(index);
  const methods = useProjectionMethods();
  const failed = [history, projection, methods].filter((query) => query.isError);

  return (
    <Page className="gap-6">
      <PageHeader className="flex-col items-stretch gap-1">
        <Button variant="link" size="inline" asChild className="self-start">
          <Link to="/mercado">
            <ChevronLeftIcon aria-hidden="true" strokeWidth={1.5} />
            Mercado
          </Link>
        </Button>
        <PageTitle>{indexNames[index]}</PageTitle>
        <p className="text-callout text-muted-foreground">{marketIndexes[index].description}</p>
      </PageHeader>
      {failed.length > 0 ? (
        <ErrorPanel
          title="Não foi possível carregar o índice"
          onRetry={() => {
            for (const query of failed) void query.refetch();
          }}
        />
      ) : !history.data || !methods.data || projection.isLoading ? (
        <DetailSkeleton />
      ) : (
        <Detail
          index={index}
          history={history.data}
          projection={projection.data}
          methods={methods.data}
        />
      )}
    </Page>
  );
}
