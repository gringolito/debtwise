import {
  ApiError,
  type ContractRate,
  type MortgageTerms,
  type RegisteredMortgage,
} from "@/lib/api";
import { fractionToPercent, inputToMoney, moneyToInput, percentToFraction } from "@/lib/format";
import { indexNames } from "@/lib/indexNames";
import { rateFromCharge } from "@/lib/insuranceRate";
import { ruleMessages } from "@/lib/rules";

export type Basis = ContractRate["basis"];
export type AmortizationSystem = MortgageTerms["amortization_system"];

export const amortizationSystemLabels: Record<AmortizationSystem, string> = {
  sac: "SAC",
  price: "Price",
};

export type Indexer = MortgageTerms["indexer"];

export const indexerLabels: Record<Indexer, string> = {
  none: "Nenhum (prefixado)",
  tr: indexNames.tr,
  ipca: indexNames.ipca,
};

/** A row in an editable list; `id` keeps a row's inputs with it when another row is removed. */
export interface EffectiveRow {
  id: number;
  effectiveFrom: string;
}

export interface ContractRateRow extends EffectiveRow {
  rate: string;
  basis: Basis;
  poupancaAdditional: boolean;
}

export interface MonthlyRateRow extends EffectiveRow {
  rate: string;
}

export interface FeeRow extends EffectiveRow {
  amount: string;
}

/** FormValues holds everything the owner typed, as text, the way the inputs show it. */
export interface FormValues {
  contractDate: string;
  originalAmount: string;
  termMonths: string;
  firstInstallmentDate: string;
  amortizationSystem: AmortizationSystem;
  indexer: Indexer;
  appraisalValue: string;
  contractRates: ContractRateRow[];
  mipRates: MonthlyRateRow[];
  dfiRates: MonthlyRateRow[];
  fees: FeeRow[];
  /** The MIP the bank charged on the first installment, which the MIP rate can be derived from. */
  firstInstallmentMip: string;
  /** The DFI the bank charged on the first installment, which the DFI rate can be derived from. */
  firstInstallmentDfi: string;
}

let lastRowId = 0;
const nextRowId = () => ++lastRowId;

export const blankContractRate = (): ContractRateRow => ({
  id: nextRowId(),
  effectiveFrom: "",
  rate: "",
  basis: "nominal",
  poupancaAdditional: false,
});
export const blankMonthlyRate = (): MonthlyRateRow => ({
  id: nextRowId(),
  effectiveFrom: "",
  rate: "",
});
export const blankFee = (): FeeRow => ({ id: nextRowId(), effectiveFrom: "", amount: "" });

export function emptyValues(): FormValues {
  return {
    contractDate: "",
    originalAmount: "",
    termMonths: "",
    firstInstallmentDate: "",
    amortizationSystem: "sac",
    indexer: "none",
    appraisalValue: "",
    contractRates: [blankContractRate()],
    mipRates: [blankMonthlyRate()],
    dfiRates: [blankMonthlyRate()],
    fees: [blankFee()],
    firstInstallmentMip: "",
    firstInstallmentDfi: "",
  };
}

const monthlyRows = (rates: { effective_from: string; rate: string }[]): MonthlyRateRow[] =>
  rates.map((r) => ({
    id: nextRowId(),
    effectiveFrom: r.effective_from,
    rate: fractionToPercent(r.rate),
  }));

/** valuesFromMortgage fills the form with the rates the owner informed, not the derived ones. */
export function valuesFromMortgage(mortgage: RegisteredMortgage): FormValues {
  return {
    contractDate: mortgage.contract_date,
    originalAmount: moneyToInput(mortgage.original_amount),
    termMonths: String(mortgage.term_months),
    firstInstallmentDate: mortgage.first_installment_date,
    amortizationSystem: mortgage.amortization_system,
    indexer: mortgage.indexer,
    appraisalValue: moneyToInput(mortgage.appraisal_value),
    contractRates: mortgage.contract_rates.map((r) => ({
      id: nextRowId(),
      effectiveFrom: r.effective_from,
      rate: fractionToPercent(r.basis === "nominal" ? r.nominal : r.effective),
      basis: r.basis,
      poupancaAdditional: r.poupanca_additional,
    })),
    mipRates: monthlyRows(mortgage.mip_rates),
    dfiRates: monthlyRows(mortgage.dfi_rates),
    fees: mortgage.fees.map((f) => ({
      id: nextRowId(),
      effectiveFrom: f.effective_from,
      amount: moneyToInput(f.amount),
    })),
    firstInstallmentMip: "",
    firstInstallmentDfi: "",
  };
}

export type Insurance = "MIP" | "DFI";

/**
 * The form values behind each insurance: its rate rows, what the owner typed it charged on the
 * first installment, and the amount the schedule charges it on there. MIP is charged on the
 * outstanding balance, which on the first installment is the original amount.
 */
export const insuranceFields = {
  MIP: { rates: "mipRates", charge: "firstInstallmentMip", base: "originalAmount" },
  DFI: { rates: "dfiRates", charge: "firstInstallmentDfi", base: "appraisalValue" },
} as const satisfies Record<
  Insurance,
  { rates: "mipRates" | "dfiRates"; charge: keyof FormValues; base: keyof FormValues }
>;

const POSITIVE_AMOUNT = /^(?=.*[1-9])\d+(\.\d+)?$/;

// The latest row effective on or before the first installment, as the schedule picks it. Until the
// dates tell, the list's first row.
function firstInstallmentRow(rows: MonthlyRateRow[], firstInstallmentDate: string) {
  let inForce: MonthlyRateRow | undefined;
  for (const row of rows) {
    if (row.effectiveFrom === "" || row.effectiveFrom > firstInstallmentDate) continue;
    if (!inForce || row.effectiveFrom > inForce.effectiveFrom) inForce = row;
  }
  return inForce ?? rows[0];
}

/** FirstCharge is what the form makes of the insurance the owner typed for the first installment. */
export interface FirstCharge {
  /** The row in force at the first installment, whose rate the charge gives. */
  row: MonthlyRateRow | undefined;
  /** The rate, as a fraction, that charges it; undefined while none can be told. */
  rate: string | undefined;
  /** Whether the amount the insurance is charged on is still missing. */
  needsBase: boolean;
}

export function firstChargeOf(values: FormValues, insurance: Insurance): FirstCharge {
  const { rates, charge, base } = insuranceFields[insurance];
  const baseAmount = inputToMoney(values[base]);
  return {
    row: firstInstallmentRow(values[rates], values.firstInstallmentDate),
    rate: rateFromCharge(inputToMoney(values[charge]), baseAmount),
    needsBase: !POSITIVE_AMOUNT.test(baseAmount),
  };
}

function withFirstChargeRate(current: FormValues, next: FormValues, insurance: Insurance) {
  const { rates, charge } = insuranceFields[insurance];
  const { row, rate } = firstChargeOf(next, insurance);
  if (row === undefined) return next;
  const typedOver = current[rates].find((r) => r.id === row.id && r.rate !== row.rate);
  if (typedOver) return { ...next, [charge]: "" };
  if (rate === undefined) return next;
  return {
    ...next,
    [rates]: next[rates].map((r) =>
      r.id === row.id ? { ...r, rate: fractionToPercent(rate) } : r,
    ),
  };
}

/**
 * withFirstChargeRates applies a change to the form, from current to next, and fills each rate in
 * force at the first installment with the one its charge gives, whatever moved: the charge, the
 * amount it is charged on, or the dates that pick the row. A rate the owner types into that row
 * drops the charge instead, which no longer gives it.
 */
export function withFirstChargeRates(current: FormValues, next: FormValues): FormValues {
  return withFirstChargeRate(current, withFirstChargeRate(current, next, "MIP"), "DFI");
}

const monthlyTerms = (rows: MonthlyRateRow[]) =>
  rows.map((r) => ({ effective_from: r.effectiveFrom, rate: percentToFraction(r.rate) }));

// Number() reads the whole text, so "6.5" stays 6.5 for the API to reject instead of becoming 6.
// Empty text has no number: NaN goes out as null, which the API rejects too.
function termToNumber(text: string): number {
  return text.trim() === "" ? Number.NaN : Number(text);
}

/** termsFromValues builds the request body. Text the API cannot read goes through for it to reject. */
export function termsFromValues(values: FormValues): MortgageTerms {
  return {
    contract_date: values.contractDate,
    original_amount: inputToMoney(values.originalAmount),
    term_months: termToNumber(values.termMonths),
    first_installment_date: values.firstInstallmentDate,
    amortization_system: values.amortizationSystem,
    indexer: values.indexer,
    appraisal_value: inputToMoney(values.appraisalValue),
    contract_rates: values.contractRates.map((r) => ({
      effective_from: r.effectiveFrom,
      rate: percentToFraction(r.rate),
      basis: r.basis,
      poupanca_additional: r.poupancaAdditional,
    })),
    mip_rates: monthlyTerms(values.mipRates),
    dfi_rates: monthlyTerms(values.dfiRates),
    fees: values.fees.map((f) => ({
      effective_from: f.effectiveFrom,
      amount: inputToMoney(f.amount),
    })),
  };
}

/**
 * rejections maps what the API rejected to the message the owner reads there: what the rule the
 * value breaks asks, or "Valor inválido." for a value the schema rejected. A location is a body
 * field, a whole list or a field of one row of it: "contract_date", "fees" or
 * "fees[1].effective_from".
 */
export function rejections(error: Error | null): Map<string, string> {
  if (!(error instanceof ApiError)) return new Map();
  return new Map(
    error.rejected.flatMap(({ location, rule }) =>
      location.startsWith("body.")
        ? [[location.slice("body.".length), rule ? ruleMessages[rule] : "Valor inválido."] as const]
        : [],
    ),
  );
}

export const rowLocation = (list: string, index: number, field: string) =>
  `${list}[${index}].${field}`;
