import type {
  EarlySaleCheck,
  LotAmount,
  LotValued,
  MarketDataStatus,
  VerdictMarketData,
} from "@/lib/api";
import type { PrepaymentEffect } from "@/lib/mortgageEvents";
import { type RecordedRequest, stubRoutes } from "./stubServer";

export function amount(
  gross: string,
  iof: string,
  incomeTax: string,
  custodyFee: string,
  net: string,
): LotAmount {
  return { gross, iof, income_tax: incomeTax, custody_fee: custodyFee, net, projected_by: [] };
}

/** An IPCA+ 2035 bought on 12/05/2024, valued with the IPCA the Focus projects. */
export const ipca2035: LotValued = {
  id: 1,
  type: "ntn_b_principal",
  maturity: "2035-05-15",
  purchase_date: "2024-05-12",
  rate: "0.0621",
  unit_price: "2012.34",
  quantity: "8",
  values: {
    on: "2026-11-06",
    market: amount("19300.12", "0.00", "1034.22", "61.80", "18204.10"),
    accrual: amount("20100.00", "0.00", "1083.58", "65.80", "18950.62"),
    maturity: {
      ...amount("44000.00", "0.00", "2400.00", "220.00", "41380.00"),
      projected_by: [{ index: "ipca", method: "focus" }],
    },
    coupons: [],
  },
};

/** A second purchase of the same IPCA+ 2035. */
export const ipca2035Again: LotValued = {
  ...ipca2035,
  id: 2,
  purchase_date: "2024-11-18",
  rate: "0.0645",
  unit_price: "2101.90",
  quantity: "6.5",
  values: {
    on: "2026-11-06",
    market: amount("15500.00", "0.00", "640.00", "47.60", "14812.40"),
    accrual: amount("15600.00", "0.00", "650.00", "48.00", "14902.00"),
    maturity: amount("33000.00", "0.00", "1800.00", "150.00", "31050.00"),
    coupons: [],
  },
};

/** A Prefixado com Juros Semestrais 2029 that Tesouro Direto quotes no sell price for. */
export const prefixado2029: LotValued = {
  id: 3,
  type: "ntn_f",
  maturity: "2029-01-01",
  purchase_date: "2025-01-10",
  rate: "0.1185",
  unit_price: "702.15",
  quantity: "20",
  values: {
    on: "2026-11-06",
    accrual: amount("15000.00", "0.00", "300.00", "40.00", "14660.00"),
    maturity: amount("21000.00", "0.00", "900.00", "60.00", "20040.00"),
    coupons: [
      { date: "2026-01-01", paid: true, ...amount("976.00", "0.00", "170.80", "6.10", "799.10") },
      { date: "2027-01-01", paid: false, ...amount("976.00", "0.00", "146.40", "5.20", "824.40") },
    ],
  },
};

/** An IPCA+ 2045 whose values wait on an IPCA neither published nor projected. */
export const waitingOnIpca: LotValued = {
  id: 4,
  type: "ntn_b_principal",
  maturity: "2045-05-15",
  purchase_date: "2026-06-01",
  rate: "0.0688",
  unit_price: "1100.00",
  quantity: "3",
  values_unavailable: "missing_ipca",
};

export const FRESH_STATUS: MarketDataStatus = {
  refreshing: false,
  indexes: [{ index: "ipca", status: "fresh", refreshed_at: "2026-11-06T18:23:39Z" }],
  bonds: { status: "fresh", refreshed_at: "2026-11-06T18:24:00Z" },
  focus: { status: "fresh", refreshed_at: "2026-11-06T18:24:30Z" },
};

export const freshMarketData: VerdictMarketData = {
  bonds: FRESH_STATUS.bonds,
  focus: FRESH_STATUS.focus,
  indexes: FRESH_STATUS.indexes,
};

/** checkFor is a lot's early sale check with an Advantage, positive favouring holding. */
export function checkFor(lot: LotValued, advantage: string): EarlySaleCheck {
  const { values: _values, values_unavailable: _unavailable, ...bought } = lot;
  return {
    lot: bought,
    verdict: advantage.startsWith("-") ? "sell" : "hold",
    advantage,
    sell_price: { rate: "0.0640", unit_price: "2250.00" },
    projected_by: [],
    market_data: freshMarketData,
  };
}

export function uncheckable(
  lot: LotValued,
  unavailable: NonNullable<EarlySaleCheck["unavailable"]>,
): EarlySaleCheck {
  const { values: _values, values_unavailable: _unavailable, ...bought } = lot;
  return { lot: bought, unavailable, projected_by: [], market_data: freshMarketData };
}

interface InvestmentsStub {
  lots: LotValued[];
  marketValue?: { gross: string; net: string };
  /** The checks answered for each effect; both effects answer `checks` when it is an array. */
  checks?: EarlySaleCheck[] | Record<PrepaymentEffect, EarlySaleCheck[]>;
  routes?: Parameters<typeof stubRoutes>[0];
}

/**
 * stubInvestments answers what Investimentos reads: the lots, which deleting one removes, their
 * early sale checks and the market data status.
 */
export function stubInvestments({
  lots: initial,
  marketValue,
  checks = [],
  routes = {},
}: InvestmentsStub): RecordedRequest[] {
  let lots = initial;
  return stubRoutes({
    "GET /api/lots": () =>
      Response.json(marketValue ? { lots, market_value: marketValue } : { lots }),
    "DELETE /api/lots/:id": (_, { id }) => {
      lots = lots.filter((lot) => lot.id !== Number(id));
      return new Response(null, { status: 204 });
    },
    "GET /api/early-sale-checks": (req) => {
      const effect = new URL(req.url).searchParams.get("effect") as PrepaymentEffect;
      const listed = Array.isArray(checks) ? checks : checks[effect];
      return Response.json({ date: "2026-11-06", effect, checks: listed });
    },
    "GET /api/market-data/status": () => Response.json(FRESH_STATUS),
    "GET /api/bonds": () => Response.json({ bonds: [] }),
    ...routes,
  });
}
