// The SDK in ./generated/ comes from docs/openapi.json through `mise run generate:openapi`.
// Never hand-edit it.
import { client } from "./generated/client.gen";
import { health, indexHistory, marketDataStatus, refreshMarketData } from "./generated/sdk.gen";
import type {
  Health,
  IndexHistory,
  IndexStatus,
  IndexValue,
  MarketDataStatus,
} from "./generated/types.gen";

export type { Health, IndexHistory, IndexStatus, IndexValue, MarketDataStatus };
export type IndexName = IndexHistory["index"];

// An absolute base, so `new Request()` also resolves it under Node's fetch in tests. The SPA
// shares the API's origin.
client.setConfig({ baseUrl: new URL("/api", globalThis.location.href).toString() });

export async function fetchHealth(): Promise<Health> {
  const { data } = await health({ throwOnError: true });
  return data;
}

/** indexHistoriesKey prefixes the query key of every index's history, to invalidate them all. */
export const indexHistoriesKey = ["index-history"] as const;

export function indexHistoryKey(index: IndexName) {
  return [...indexHistoriesKey, index] as const;
}

export async function fetchIndexHistory(index: IndexName): Promise<IndexHistory> {
  const { data } = await indexHistory({ path: { index }, throwOnError: true });
  return data;
}

export async function fetchMarketDataStatus(): Promise<MarketDataStatus> {
  const { data } = await marketDataStatus({ throwOnError: true });
  return data;
}

export async function startMarketDataRefresh(): Promise<MarketDataStatus> {
  const { data } = await refreshMarketData({ throwOnError: true });
  return data;
}
