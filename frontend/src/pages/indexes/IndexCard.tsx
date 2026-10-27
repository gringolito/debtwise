import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchIndexHistory, indexHistoryKey, type IndexName, type IndexStatus } from "@/lib/api";
import { formatDateTime, formatNumber, formatPercent, formatPeriod } from "@/lib/format";
import { indexNames } from "@/lib/indexNames";
import { IndexHistoryChart } from "@/pages/indexes/IndexHistoryChart";
import { ProjectionControls } from "@/pages/indexes/ProjectionControls";
import { useIndexProjection } from "@/pages/indexes/projectionQueries";
import { FreshnessWarning } from "@/pages/marketdata/FreshnessWarning";

const INDEX_UNITS: Record<IndexName, { unit: string; format: (value: string) => string }> = {
  tr: { unit: "% no período", format: formatPercent },
  poupanca_yield: { unit: "% no período", format: formatPercent },
  selic_target: { unit: "% a.a.", format: formatPercent },
  selic: { unit: "% a.d.", format: formatPercent },
  ipca: { unit: "% no mês", format: formatPercent },
  ipca_number: { unit: "dez/1993 = 100", format: formatNumber },
};

// The indexes whose future values are projected.
const PROJECTED: readonly IndexName[] = ["tr", "poupanca_yield", "selic_target", "ipca"];

export function IndexCard({ status }: { status: IndexStatus }) {
  const { unit, format } = INDEX_UNITS[status.index];
  const title = indexNames[status.index];
  const history = useQuery({
    queryKey: indexHistoryKey(status.index),
    queryFn: () => fetchIndexHistory(status.index),
  });
  const projected = PROJECTED.includes(status.index);
  const projection = useIndexProjection(status.index, projected);
  const values = history.data?.values ?? [];
  const latest = values.at(-1);

  return (
    <Card role="region" aria-label={title}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{unit}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground">
            {status.refreshed_at
              ? `Atualizado em ${formatDateTime(status.refreshed_at)}`
              : "Nunca atualizado"}
          </p>
          <FreshnessWarning status={status} missing="Ainda não há dados deste índice." />
          {history.isError && (
            <Alert variant="destructive">
              <AlertDescription>Não foi possível carregar o histórico.</AlertDescription>
            </Alert>
          )}
          {projection.isError && (
            <Alert variant="destructive">
              <AlertDescription>Não foi possível carregar a projeção.</AlertDescription>
            </Alert>
          )}
          {latest && (
            <div>
              <p className="text-2xl font-semibold">{format(latest.value)}</p>
              <p className="text-muted-foreground">
                {formatPeriod(latest.period_start, latest.period_end)}
              </p>
            </div>
          )}
          {latest && (
            <IndexHistoryChart title={title} values={values} projection={projection.data?.values} />
          )}
          {projected && <ProjectionControls index={status.index} />}
        </div>
      </CardContent>
    </Card>
  );
}
