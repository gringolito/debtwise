import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchIndexHistory, type IndexName, type IndexStatus } from "@/lib/api";
import { formatDateTime, formatPercent, formatPeriod } from "@/lib/format";
import { IndexHistoryChart } from "@/pages/indices/IndexHistoryChart";
import { IndexWarning } from "@/pages/indices/IndexWarning";

const INDEX_COPY: Record<IndexName, { title: string; unit: string }> = {
  tr: { title: "TR", unit: "% no período" },
  poupanca: { title: "Poupança", unit: "% no período" },
  selic_target: { title: "Selic meta", unit: "% a.a." },
  selic: { title: "Selic diária", unit: "% a.d." },
  ipca: { title: "IPCA", unit: "% no mês" },
};

export function IndexCard({ status }: { status: IndexStatus }) {
  const { title, unit } = INDEX_COPY[status.index];
  const history = useQuery({
    queryKey: ["index-history", status.index],
    queryFn: () => fetchIndexHistory(status.index),
  });
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
          <IndexWarning status={status} />
          {history.isError && (
            <Alert variant="destructive">
              <AlertDescription>Não foi possível carregar o histórico.</AlertDescription>
            </Alert>
          )}
          {latest && (
            <div>
              <p className="text-2xl font-semibold">{formatPercent(latest.value)}</p>
              <p className="text-muted-foreground">
                {formatPeriod(latest.period_start, latest.period_end)}
              </p>
            </div>
          )}
          {latest && <IndexHistoryChart title={title} values={values} />}
        </div>
      </CardContent>
    </Card>
  );
}
