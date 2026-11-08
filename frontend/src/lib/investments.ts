import type { EarlySaleCheck, LotValued, ProjectedBy, VerdictMarketData } from "@/lib/api";
import { bondLabel } from "@/lib/bondKinds";
import { isZero } from "@/lib/decisions";
import type { PrepaymentEffect } from "@/lib/mortgageEvents";

/** BondGroup is every lot of one bond, in the order the API lists them. */
export interface BondGroup {
  label: string;
  lots: LotValued[];
}

/** groupByBond groups lots by bond, the bonds maturing first leading. */
export function groupByBond(lots: LotValued[]): BondGroup[] {
  const groups = new Map<string, LotValued[]>();
  for (const lot of lots) {
    const key = `${lot.maturity} ${lot.type}`;
    groups.set(key, [...(groups.get(key) ?? []), lot]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, bondLots]) => ({ label: bondLabel(bondLots[0]), lots: bondLots }));
}

/**
 * leftOutOfMarketTotal counts the lots the total Market Value leaves out though their bond hasn't
 * matured on today: those with no sell price, or no values at all.
 */
export function leftOutOfMarketTotal(lots: LotValued[], today: string): number {
  return lots.filter((lot) => !lot.values?.market && lot.maturity > today).length;
}

/** projectionsOf lists each projection method a lot's values read once, in the order met. */
export function projectionsOf(lot: LotValued): ProjectedBy[] {
  const values = lot.values;
  if (!values) return [];
  const amounts = [values.market, values.accrual, values.maturity, ...values.coupons];
  const seen = new Map<string, ProjectedBy>();
  for (const amount of amounts) {
    for (const method of amount?.projected_by ?? []) {
      seen.set(`${method.index} ${method.method}`, method);
    }
  }
  return [...seen.values()];
}

/**
 * SaleGain is what selling a lot today and prepaying gains over holding it: the Advantage with its
 * sign turned, as a gain favours selling and a loss holding.
 */
export interface SaleGain {
  kind: "gain" | "loss" | "even";
  /** The amount without its sign, as a decimal string. */
  amount: string;
}

/** saleGain reads an early sale check's Advantage as what selling gains over holding. */
export function saleGain(advantage: string): SaleGain {
  const amount = advantage.replace(/^-/, "");
  if (isZero(advantage)) return { kind: "even", amount };
  return { kind: advantage.startsWith("-") ? "gain" : "loss", amount };
}

/** checkOf finds a lot's early sale check in a list of them. */
export function checkOf(checks: EarlySaleCheck[], lotId: number): EarlySaleCheck | undefined {
  return checks.find((check) => check.lot.id === lotId);
}

/**
 * marketDataOf is the market data a list of checks reads together: each check reports the bond
 * prices and Focus, and only the indexes its own lot follows.
 */
export function marketDataOf(checks: EarlySaleCheck[]): VerdictMarketData | undefined {
  const [first] = checks;
  if (!first) return undefined;
  const indexes = new Map(
    checks.flatMap((check) => check.market_data.indexes).map((index) => [index.index, index]),
  );
  return { ...first.market_data, indexes: [...indexes.values()] };
}

/**
 * EffectSearch is what an Investimentos address says about the effect of the early sales it
 * compares: `efeito=reduzir-prestacao` lowers the installment; without it, the term is shortened.
 */
export interface EffectSearch {
  efeito?: "reduzir-prestacao";
}

export function validateEffectSearch(search: Record<string, unknown>): EffectSearch {
  return search.efeito === "reduzir-prestacao" ? { efeito: "reduzir-prestacao" } : {};
}

export function effectOf(search: EffectSearch): PrepaymentEffect {
  return search.efeito === "reduzir-prestacao" ? "lower_installment" : "shorten_term";
}

export function effectSearch(effect: PrepaymentEffect): EffectSearch {
  return effect === "lower_installment" ? { efeito: "reduzir-prestacao" } : {};
}
