import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { IndexCard } from "@/pages/indexes/IndexCard";
import { ProjectionMethodsError } from "@/pages/indexes/ProjectionControls";
import { FreshnessWarning } from "@/pages/marketdata/FreshnessWarning";
import { useMarketData } from "@/pages/marketdata/useMarketData";

export function Indexes() {
  const { status, refresh, refreshing } = useMarketData();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Índices</h2>
        <Button disabled={refreshing || refresh.isPending} onClick={() => refresh.mutate()}>
          {refreshing ? "Atualizando…" : "Atualizar"}
        </Button>
      </div>
      {refresh.isError && (
        <Alert variant="destructive">
          <AlertDescription>Não foi possível iniciar a atualização.</AlertDescription>
        </Alert>
      )}
      {status.isError && (
        <Alert variant="destructive">
          <AlertDescription>Não foi possível carregar os índices.</AlertDescription>
        </Alert>
      )}
      {status.data && (
        <FreshnessWarning
          title="Expectativas do Focus"
          status={status.data.focus}
          missing="Ainda não há expectativas do Focus."
        />
      )}
      {status.data && <ProjectionMethodsError />}
      {status.data?.indexes.map((index) => (
        <IndexCard key={index.index} status={index} />
      ))}
    </section>
  );
}
