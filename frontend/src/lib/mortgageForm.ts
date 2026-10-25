import { ApiError, type MortgageTerms, type RegisteredMortgage } from "@/lib/api";
import { fractionToPercent, inputToMoney, moneyToInput, percentToFraction } from "@/lib/ptbr";

export type Basis = "nominal" | "effective";
export type AmortizationSystem = "sac" | "price";

// A row in an editable list; `id` keeps a row's inputs with it when another row is removed.
interface Row {
  id: number;
  effectiveFrom: string;
}

export interface ContractRateRow extends Row {
  rate: string;
  basis: Basis;
}

export interface MonthlyRateRow extends Row {
  rate: string;
}

export interface FeeRow extends Row {
  amount: string;
}

/** FormValues holds everything the owner typed, as text, the way the inputs show it. */
export interface FormValues {
  contractDate: string;
  originalAmount: string;
  termMonths: string;
  firstInstallmentDate: string;
  amortizationSystem: AmortizationSystem;
  appraisalValue: string;
  contractRates: ContractRateRow[];
  mipRates: MonthlyRateRow[];
  dfiRates: MonthlyRateRow[];
  fees: FeeRow[];
}

let lastRowId = 0;
const nextRowId = () => ++lastRowId;

export const blankContractRate = (): ContractRateRow => ({
  id: nextRowId(),
  effectiveFrom: "",
  rate: "",
  basis: "nominal",
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
    appraisalValue: "",
    contractRates: [blankContractRate()],
    mipRates: [blankMonthlyRate()],
    dfiRates: [blankMonthlyRate()],
    fees: [blankFee()],
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
    appraisalValue: moneyToInput(mortgage.appraisal_value),
    contractRates: mortgage.contract_rates.map((r) => ({
      id: nextRowId(),
      effectiveFrom: r.effective_from,
      rate: fractionToPercent(r.basis === "nominal" ? r.nominal : r.effective),
      basis: r.basis,
    })),
    mipRates: monthlyRows(mortgage.mip_rates),
    dfiRates: monthlyRows(mortgage.dfi_rates),
    fees: mortgage.fees.map((f) => ({
      id: nextRowId(),
      effectiveFrom: f.effective_from,
      amount: moneyToInput(f.amount),
    })),
  };
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
    appraisal_value: inputToMoney(values.appraisalValue),
    contract_rates: values.contractRates.map((r) => ({
      effective_from: r.effectiveFrom,
      rate: percentToFraction(r.rate),
      basis: r.basis,
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
 * invalidLocations lists what the API rejected, as "contract_date", "fees" or
 * "fees[1].effective_from": a body field, a whole list or a field of one row of it.
 */
export function invalidLocations(error: Error | null): Set<string> {
  if (!(error instanceof ApiError)) return new Set();
  return new Set(
    error.locations.flatMap((location) =>
      location.startsWith("body.") ? [location.slice("body.".length)] : [],
    ),
  );
}

export const rowLocation = (list: string, index: number, field: string) =>
  `${list}[${index}].${field}`;
