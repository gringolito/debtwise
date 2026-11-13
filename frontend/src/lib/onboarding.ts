import type { MortgageTerms } from "@/lib/api";
import {
  emptyValues,
  type FormValues,
  type Indexer,
  indexerLabels,
  termsFromValues,
  unchosenIndexer,
} from "@/lib/mortgageForm";

/** The body fields each step asks for, in step order; the review that follows asks for none. */
const stepFields = [
  ["contract_date", "original_amount", "term_months", "first_installment_date"],
  ["amortization_system"],
  ["indexer"],
  ["contract_rates"],
  ["appraisal_value", "mip_rates", "dfi_rates", "fees"],
];

/** The last step that asks for terms, after which the review previews them. */
export const LAST_TERMS_STEP = stepFields.length;
export const REVIEW_STEP = LAST_TERMS_STEP + 1;
export const STEP_COUNT = REVIEW_STEP;

/** The indexers the onboarding offers, by the names and descriptions the owner reads. */
export const indexerChoices: { value: Indexer; name: string; description: string }[] = [
  {
    value: "tr",
    name: indexerLabels.tr,
    description: "Taxa Referencial. Comum em contratos da Caixa e do SFH.",
  },
  {
    value: "ipca",
    name: indexerLabels.ipca,
    description: "Inflação oficial. O saldo acompanha a inflação.",
  },
  { value: "none", name: "Nenhum", description: "Contrato prefixado. Só os juros do contrato." },
];

const fieldSteps = new Map(
  stepFields.flatMap((fields, index) => fields.map((field) => [field, index + 1] as const)),
);

/**
 * stepOf is the first step that asks for a field the API rejected, given locations as
 * rejections names them; undefined when no step asks for any of them.
 */
export function stepOf(locations: Iterable<string>): number | undefined {
  let first: number | undefined;
  for (const location of locations) {
    const step = fieldSteps.get(location.split(/[.[]/, 1)[0]);
    if (step !== undefined && (first === undefined || step < first)) first = step;
  }
  return first;
}

/**
 * The onboarding starts on the effective basis, which it asks for when the contract shows both,
 * and on SAC. The indexer has no default: a wrong guess would silently skew every projection, so
 * the owner has to choose it.
 */
export function onboardingValues(): FormValues {
  const values = emptyValues();
  return {
    ...values,
    indexer: unchosenIndexer,
    contractRates: values.contractRates.map((row) => ({ ...row, basis: "effective" })),
  };
}

/**
 * onboardingTerms builds the request body from what the onboarding asks. It asks for one rate of
 * each insurance and one admin fee, in force from the first installment, as is the first contract
 * rate; an admin fee left empty is none.
 */
export function onboardingTerms(values: FormValues): MortgageTerms {
  const from = values.firstInstallmentDate;
  const [firstRate, ...rateChanges] = values.contractRates;
  const fromFirst = <T extends { effectiveFrom: string }>(row: T): T => ({
    ...row,
    effectiveFrom: from,
  });
  return termsFromValues({
    ...values,
    contractRates: [fromFirst(firstRate), ...rateChanges],
    mipRates: values.mipRates.map(fromFirst),
    dfiRates: values.dfiRates.map(fromFirst),
    fees: values.fees.map((fee) => ({
      ...fromFirst(fee),
      amount: fee.amount.trim() === "" ? "0" : fee.amount,
    })),
  });
}
