import type { MarketDataStatus } from "@/lib/api";

export type Freshness = MarketDataStatus["focus"]["status"];

export interface SourceFreshness {
  name: string;
  status: Freshness;
  /** When the source was last refreshed successfully; absent when it never was. */
  refreshedAt?: string;
}

/** What each freshness means, as its dot says it to assistive technology. */
export const freshnessLabels: Record<Freshness, string> = {
  fresh: "Em dia",
  stale: "Desatualizado",
  failed: "A última atualização falhou",
  missing: "Indisponível",
};

// Least fresh last, so a group of sources reads as its least fresh one.
const order: Freshness[] = ["fresh", "stale", "failed", "missing"];

/**
 * sourceFreshness says how fresh each source of market data is. The indexes count as one source,
 * as fresh as the least fresh of them and updated when the one updated longest ago was.
 */
export function sourceFreshness({ indexes, focus, bonds }: MarketDataStatus): SourceFreshness[] {
  const status = indexes.reduce<Freshness>(
    (least, index) => (order.indexOf(index.status) > order.indexOf(least) ? index.status : least),
    indexes.length > 0 ? "fresh" : "missing",
  );
  const [oldest] = indexes
    .map((index) => index.refreshed_at)
    .filter((instant) => instant !== undefined)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return [
    { name: "Índices (Banco Central)", status, refreshedAt: oldest },
    { name: "Expectativas (Focus)", status: focus.status, refreshedAt: focus.refreshed_at },
    {
      name: "Preços dos títulos (Tesouro Direto)",
      status: bonds.status,
      refreshedAt: bonds.refreshed_at,
    },
  ];
}
