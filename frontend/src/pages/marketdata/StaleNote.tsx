import { ClockIcon } from "lucide-react";
import type { VerdictMarketData } from "@/lib/api";
import { staleSources } from "@/lib/dashboard";
import { formatInstantDayMonth } from "@/lib/format";
import { useMarketData } from "@/pages/marketdata/useMarketData";

/**
 * StaleNote names each source of market data a result reads that is not fresh, with the day of its
 * last update, and offers to update them. It shows nothing while every source is fresh.
 */
export function StaleNote({ marketData }: { marketData: VerdictMarketData }) {
  const { refresh, refreshing } = useMarketData();
  const sources = staleSources(marketData);
  if (sources.length === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 px-1 text-footnote text-caution">
      <ClockIcon aria-hidden="true" strokeWidth={1.5} className="size-4" />
      <span>
        {sources
          .map(({ name, refreshedAt }) =>
            refreshedAt
              ? `${name} de ${formatInstantDayMonth(refreshedAt)}.`
              : `${name} indisponível.`,
          )
          .join(" ")}
      </span>{" "}
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
    </p>
  );
}
