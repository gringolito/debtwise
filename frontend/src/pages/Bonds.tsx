import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { bondsKey, fetchBonds } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { BondsTable } from "@/pages/bonds/BondsTable";
import { FreshnessWarning } from "@/pages/marketdata/FreshnessWarning";
import { useMarketData } from "@/pages/marketdata/useMarketData";

export function Bonds() {
  const { status, refresh, refreshing } = useMarketData();
  const bonds = useQuery({ queryKey: bondsKey, queryFn: fetchBonds });
  const refreshedAt = status.data?.bonds.refreshed_at;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Títulos</h2>
        <Button disabled={refreshing || refresh.isPending} onClick={() => refresh.mutate()}>
          {refreshing ? "Atualizando…" : "Atualizar"}
        </Button>
      </div>
      {refresh.isError && (
        <Alert variant="destructive">
          <AlertDescription>Não foi possível iniciar a atualização.</AlertDescription>
        </Alert>
      )}
      {status.data && (
        <p className="text-muted-foreground">
          {refreshedAt ? `Atualizado em ${formatDateTime(refreshedAt)}` : "Nunca atualizado"}
        </p>
      )}
      {status.data && (
        <FreshnessWarning status={status.data.bonds} missing="Ainda não há preços de títulos." />
      )}
      {bonds.isError && (
        <Alert variant="destructive">
          <AlertDescription>Não foi possível carregar os títulos.</AlertDescription>
        </Alert>
      )}
      {bonds.data &&
        (bonds.data.bonds.length === 0 ? (
          <p className="text-muted-foreground">Nenhum título disponível.</p>
        ) : (
          <BondsTable bonds={bonds.data.bonds} />
        ))}
    </section>
  );
}
