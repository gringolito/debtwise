import { formatDate, formatMoney, formatRate, inputToMoney } from "@/lib/format";
import {
  blankContractRate,
  blankFee,
  blankMonthlyRate,
  type ContractRateRow,
  type EffectiveRow,
  type FeeRow,
  type FormValues,
  type Insurance,
  type MonthlyRateRow,
  rowLocation,
} from "@/lib/mortgageForm";

/** The lists of dated changes in the form. */
export type ChangeList = "contractRates" | "mipRates" | "dfiRates" | "fees";

export type InsuranceList = "mipRates" | "dfiRates";

/** The insurance each insurance list holds the rates of. */
export const insuranceOf: Record<InsuranceList, Insurance> = { mipRates: "MIP", dfiRates: "DFI" };

export const isInsuranceList = (list: ChangeList): list is InsuranceList =>
  list === "mipRates" || list === "dfiRates";

/** One dated change and the list it belongs to, which tells what the change holds. */
export type Change =
  | { list: "contractRates"; row: ContractRateRow }
  | { list: InsuranceList; row: MonthlyRateRow }
  | { list: "fees"; row: FeeRow };

/** A row of any list, as code that handles every list sees it. */
export type ListRow = Change["row"];

/** Each list's name in the API, which locates what it rejects: "mip_rates[1].rate". */
export const apiNames: Record<ChangeList, string> = {
  contractRates: "contract_rates",
  mipRates: "mip_rates",
  dfiRates: "dfi_rates",
  fees: "fees",
};

/** A blank change for a list. A contract rate keeps the basis of the latest one. */
export function blankChange(values: FormValues, list: ChangeList): ListRow {
  if (list === "fees") return blankFee();
  if (isInsuranceList(list)) return blankMonthlyRate();
  const [latest] = inDateOrder(values.contractRates).slice(-1);
  return { ...blankContractRate(), basis: latest?.row.basis ?? "nominal" };
}

/**
 * The rows of a list in date order, each with its position in the list, which is how the API
 * names it. Rows without a date yet go last.
 */
export function inDateOrder<T extends EffectiveRow>(rows: T[]): { row: T; index: number }[] {
  const dated = (row: T) => row.effectiveFrom !== "";
  return rows
    .map((row, index) => ({ row, index }))
    .sort(
      (a, b) =>
        Number(dated(b.row)) - Number(dated(a.row)) ||
        a.row.effectiveFrom.localeCompare(b.row.effectiveFrom),
    );
}

/** Where a change starts, to follow its name: "a partir de 15/03/2023". */
export function since(row: EffectiveRow): string {
  return row.effectiveFrom === "" ? "sem data" : `a partir de ${formatDate(row.effectiveFrom)}`;
}

const TYPED_NUMBER = /^\d+(,\d+)?$/;

/** A percent as typed, with at least two decimal places: "9,5" reads "9,50". */
export function typedPercent(text: string): string {
  const typed = text.trim();
  if (!TYPED_NUMBER.test(typed)) return typed === "" ? "—" : typed;
  const [integer, fraction = ""] = typed.split(",");
  return `${integer},${fraction.padEnd(2, "0")}`;
}

const basisNames = { effective: "efetiva", nominal: "nominal" } as const;

/**
 * A contract rate as the list reads it: "9,50 % ao ano · efetiva + poupança". A rate still as
 * registered also says what it equals in the other basis, as the server converted it.
 */
export function rateValue(row: ContractRateRow): string {
  const poupanca = row.poupancaAdditional ? " + poupança" : "";
  const value = `${typedPercent(row.rate)} % ao ano · ${basisNames[row.basis]}${poupanca}`;
  const { registered } = row;
  if (registered?.rate !== row.rate || registered.basis !== row.basis) return value;
  const other = row.basis === "effective" ? "nominal" : "effective";
  return `${value} · equivale a ${formatRate(registered.equivalent)} ${basisNames[other]}`;
}

const PLAIN_DECIMAL = /^\d+(\.\d+)?$/;

/** An amount as typed, in reais: "12,5" reads "R$ 12,50". */
export function typedMoney(text: string): string {
  const amount = inputToMoney(text);
  if (PLAIN_DECIMAL.test(amount)) return formatMoney(amount);
  return amount === "" ? "—" : text.trim();
}

/** The messages for what the API rejected in one row of a list, once each. */
export function rowMessages(
  messages: Map<string, string>,
  list: ChangeList,
  index: number,
): string[] {
  const prefix = rowLocation(apiNames[list], index, "");
  const found = [...messages].filter(([location]) => location.startsWith(prefix));
  return [...new Set(found.map(([, message]) => message))];
}
