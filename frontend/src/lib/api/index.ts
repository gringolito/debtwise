// The SDK in ./generated/ comes from docs/openapi.json through `mise run generate:openapi`.
// Never hand-edit it.
import { client } from "./generated/client.gen";
import {
  deleteMortgage,
  health,
  indexHistory,
  listBonds,
  marketDataStatus,
  readMortgage,
  readMortgageSchedule,
  refreshMarketData,
  saveMortgage,
} from "./generated/sdk.gen";
import type {
  BondCatalogue,
  BondPrice,
  BondQuote,
  BondsStatus,
  ContractRate,
  CorrectionIndex,
  ErrorModel,
  Health,
  IndexHistory,
  IndexStatus,
  IndexValue,
  MarketDataStatus,
  MortgageTerms,
  RegisteredMortgage,
  Schedule,
  ScheduledInstallment,
} from "./generated/types.gen";

export type {
  BondCatalogue,
  BondPrice,
  BondQuote,
  BondsStatus,
  ContractRate,
  CorrectionIndex,
  Health,
  IndexHistory,
  IndexStatus,
  IndexValue,
  MarketDataStatus,
  MortgageTerms,
  RegisteredMortgage,
  Schedule,
  ScheduledInstallment,
};
export type IndexName = IndexHistory["index"];

// An absolute base, so `new Request()` also resolves it under Node's fetch in tests. The SPA
// shares the API's origin.
client.setConfig({ baseUrl: new URL("/api", globalThis.location.href).toString() });

/** ApiError is a failed call; `status` is unset when the server never answered. */
export class ApiError extends Error {
  readonly status: number | undefined;
  /** The `location` of each error detail of a problem response, e.g. `body.fees[1].amount`. */
  readonly locations: string[];

  constructor(status: number | undefined, problem: ErrorModel | undefined) {
    super(problem?.detail ?? `request failed with status ${status}`);
    this.status = status;
    this.locations = (problem?.errors ?? []).flatMap((e) => (e.location ? [e.location] : []));
  }
}

function failure(error: unknown, response: Response | undefined): ApiError {
  return new ApiError(response?.status, error as ErrorModel | undefined);
}

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

/** bondsKey is the query key of the bond catalogue. */
export const bondsKey = ["bonds"] as const;

export async function fetchBonds(): Promise<BondCatalogue> {
  const { data } = await listBonds({ throwOnError: true });
  return data;
}

/** fetchMortgage resolves to null while no mortgage is registered. */
export async function fetchMortgage(): Promise<RegisteredMortgage | null> {
  const { data, error, response } = await readMortgage();
  if (response?.status === 404) return null;
  if (!data) throw failure(error, response);
  return data;
}

export async function fetchMortgageSchedule(): Promise<Schedule> {
  const { data, error, response } = await readMortgageSchedule();
  if (!data) throw failure(error, response);
  return data;
}

export async function putMortgage(terms: MortgageTerms): Promise<RegisteredMortgage> {
  const { data, error, response } = await saveMortgage({ body: terms });
  if (!data) throw failure(error, response);
  return data;
}

export async function removeMortgage(): Promise<void> {
  const { error, response } = await deleteMortgage();
  if (!response?.ok) throw failure(error, response);
}
