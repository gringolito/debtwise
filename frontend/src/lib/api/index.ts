// The SDK in ./generated/ comes from docs/openapi.json through `mise run generate:openapi`.
// Never hand-edit it.
import { client } from "./generated/client.gen";
import {
  addLot,
  addPrepayment,
  addStatement,
  decide as requestDecision,
  deleteLot,
  deleteMortgage,
  deletePrepayment,
  deleteStatement,
  editLot,
  editPrepayment,
  editStatement,
  health,
  indexHistory,
  indexProjection,
  listBonds,
  listLots,
  listPrepayments,
  listStatements,
  marketDataStatus,
  projectionMethods,
  readMortgage,
  readMortgageSchedule,
  refreshMarketData,
  saveMortgage,
  saveProjectionMethod as putProjectionMethod,
} from "./generated/sdk.gen";
import type {
  BondCatalogue,
  BondPrice,
  BondQuote,
  BondsStatus,
  CashFlow,
  CashFlowInstallment,
  ContractRate,
  CorrectionIndex,
  Decision,
  DecisionInput,
  ErrorModel,
  Health,
  IndexHistory,
  IndexProjection,
  IndexStatus,
  IndexValue,
  Lot,
  LotAmount,
  LotCoupon,
  LotInput,
  LotList,
  LotValued,
  LotValues,
  MarketDataStatus,
  MortgageTerms,
  Prepayment,
  PrepaymentInput,
  PrepaymentList,
  ProjectedBy,
  ProjectedValue,
  ProjectionMethod,
  ProjectionMethods,
  RegisteredMortgage,
  Scenario,
  Schedule,
  ScheduledInstallment,
  Statement,
  StatementDrift,
  StatementInput,
  StatementList,
  Verdict,
  VerdictMarketData,
} from "./generated/types.gen";

export type {
  BondCatalogue,
  BondPrice,
  BondQuote,
  BondsStatus,
  CashFlow,
  CashFlowInstallment,
  ContractRate,
  CorrectionIndex,
  Decision,
  DecisionInput,
  Health,
  IndexHistory,
  IndexProjection,
  IndexStatus,
  IndexValue,
  Lot,
  LotAmount,
  LotCoupon,
  LotInput,
  LotList,
  LotValued,
  LotValues,
  MarketDataStatus,
  MortgageTerms,
  Prepayment,
  PrepaymentInput,
  PrepaymentList,
  ProjectedBy,
  ProjectedValue,
  ProjectionMethod,
  ProjectionMethods,
  RegisteredMortgage,
  Scenario,
  Schedule,
  ScheduledInstallment,
  Statement,
  StatementDrift,
  StatementInput,
  StatementList,
  Verdict,
  VerdictMarketData,
};
export type IndexName = IndexHistory["index"];
export type ProjectionMethodName = ProjectionMethod["method"];

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

/** indexProjectionsKey prefixes the query key of every index's projection, to invalidate them all. */
export const indexProjectionsKey = ["index-projection"] as const;

export function indexProjectionKey(index: IndexName) {
  return [...indexProjectionsKey, index] as const;
}

export async function fetchIndexProjection(index: IndexName): Promise<IndexProjection> {
  const { data } = await indexProjection({ path: { index }, throwOnError: true });
  return data;
}

/** projectionMethodsKey is the query key of the projection method of every projected index. */
export const projectionMethodsKey = ["projection-methods"] as const;

export async function fetchProjectionMethods(): Promise<ProjectionMethods> {
  const { data } = await projectionMethods({ throwOnError: true });
  return data;
}

export async function saveProjectionMethod(
  index: IndexName,
  method: ProjectionMethodName,
): Promise<ProjectionMethod> {
  const { data, error, response } = await putProjectionMethod({
    path: { index },
    body: { method },
  });
  if (!data) throw failure(error, response);
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

export async function fetchPrepayments(): Promise<PrepaymentList> {
  const { data, error, response } = await listPrepayments();
  if (!data) throw failure(error, response);
  return data;
}

export async function postPrepayment(body: PrepaymentInput): Promise<Prepayment> {
  const { data, error, response } = await addPrepayment({ body });
  if (!data) throw failure(error, response);
  return data;
}

export async function putPrepayment(id: number, body: PrepaymentInput): Promise<Prepayment> {
  const { data, error, response } = await editPrepayment({ path: { id }, body });
  if (!data) throw failure(error, response);
  return data;
}

export async function removePrepayment(id: number): Promise<void> {
  const { error, response } = await deletePrepayment({ path: { id } });
  if (!response?.ok) throw failure(error, response);
}

export async function fetchStatements(): Promise<StatementList> {
  const { data, error, response } = await listStatements();
  if (!data) throw failure(error, response);
  return data;
}

export async function postStatement(body: StatementInput): Promise<Statement> {
  const { data, error, response } = await addStatement({ body });
  if (!data) throw failure(error, response);
  return data;
}

export async function putStatement(id: number, body: StatementInput): Promise<Statement> {
  const { data, error, response } = await editStatement({ path: { id }, body });
  if (!data) throw failure(error, response);
  return data;
}

export async function removeStatement(id: number): Promise<void> {
  const { error, response } = await deleteStatement({ path: { id } });
  if (!response?.ok) throw failure(error, response);
}

export async function fetchLots(): Promise<LotList> {
  const { data, error, response } = await listLots();
  if (!data) throw failure(error, response);
  return data;
}

export async function postLot(body: LotInput): Promise<Lot> {
  const { data, error, response } = await addLot({ body });
  if (!data) throw failure(error, response);
  return data;
}

export async function putLot(id: number, body: LotInput): Promise<Lot> {
  const { data, error, response } = await editLot({ path: { id }, body });
  if (!data) throw failure(error, response);
  return data;
}

export async function removeLot(id: number): Promise<void> {
  const { error, response } = await deleteLot({ path: { id } });
  if (!response?.ok) throw failure(error, response);
}

export async function decide(body: DecisionInput): Promise<Decision> {
  const { data, error, response } = await requestDecision({ body });
  if (!data) throw failure(error, response);
  return data;
}
