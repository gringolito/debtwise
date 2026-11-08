import type { VerdictMarketData } from "@/lib/api";
import { staleSources } from "@/lib/dashboard";
import { StaleSourcesNote } from "@/pages/marketdata/StaleSourcesNote";
import { useMarketData } from "@/pages/marketdata/useMarketData";

/**
 * StaleNote names each source of market data a result reads that is not fresh, with the day of its
 * last update, and offers to update them. It shows nothing while every source is fresh.
 */
export function StaleNote({ marketData }: { marketData: VerdictMarketData }) {
  const { refresh, refreshing } = useMarketData();
  return (
    <StaleSourcesNote sources={staleSources(marketData)}>
      {refreshing || refresh.isPending ? (
        <span>Atualizando…</span>
      ) : (
        <button
          type="button"
          className="font-medium underline underline-offset-2"
          onClick={() => refresh.mutate()}
        >
          Atualizar
        </button>
      )}
    </StaleSourcesNote>
  );
}
