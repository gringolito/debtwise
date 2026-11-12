// PROTOTYPE, throwaway: what the browser can tell about each onboarding step before it advances.
// Errors are keyed by the location the API would reject ("contract_date", "fees[0].amount"), so the
// steps' existing `messageOf` finds them without knowing where a message came from.
import { inputToMoney } from "@/lib/format";
import type { FormValues, Indexer } from "@/lib/mortgageForm";
import { onboardingValues } from "@/lib/onboarding";

export type StepErrors = Map<string, string>;

/** Variant B/C starts step 3 with nothing chosen; the first check asks for a choice. */
export function protoOnboardingValues(): FormValues {
  return { ...onboardingValues(), indexer: "" as Indexer };
}

const MONEY = /^\d+(\.\d{1,2})?$/;
const PERCENT = /^\d+(\.\d+)?$/;

type Parsed = "empty" | "malformed" | "zero" | "ok";

function money(text: string): Parsed {
  if (text.trim() === "") return "empty";
  const value = inputToMoney(text);
  if (!MONEY.test(value)) return "malformed";
  return Number(value) > 0 ? "ok" : "zero";
}

const COMPLETE_DATE = /^\d{4}-\d{2}-\d{2}$/;

function percent(text: string): Parsed {
  if (text.trim() === "") return "empty";
  const value = text.trim().replace(",", ".");
  if (!PERCENT.test(value)) return "malformed";
  return Number(value) > 0 ? "ok" : "zero";
}

function contractStep(v: FormValues, errors: StepErrors) {
  if (!COMPLETE_DATE.test(v.contractDate)) {
    errors.set("contract_date", "Informe a data do contrato.");
  }

  const amount = money(v.originalAmount);
  if (amount === "empty") errors.set("original_amount", "Informe o valor financiado.");
  else if (amount === "malformed")
    errors.set("original_amount", "Use só números, como 250.000,00.");
  else if (amount === "zero")
    errors.set("original_amount", "O valor financiado precisa ser maior que zero.");

  const term = v.termMonths.trim();
  if (term === "") errors.set("term_months", "Informe o prazo em meses, como 420.");
  else if (!/^\d+$/.test(term)) errors.set("term_months", "O prazo é em meses, como 420.");
  else if (Number(term) < 1 || Number(term) > 600)
    errors.set("term_months", "O prazo vai de 1 a 600 meses.");

  if (!COMPLETE_DATE.test(v.firstInstallmentDate)) {
    errors.set("first_installment_date", "Informe a data da primeira prestação.");
  } else if (COMPLETE_DATE.test(v.contractDate) && v.firstInstallmentDate < v.contractDate) {
    errors.set("first_installment_date", "A primeira prestação vem depois da data do contrato.");
  }
}

function indexerStep(v: FormValues, errors: StepErrors) {
  if (v.indexer !== "none" && v.indexer !== "tr" && v.indexer !== "ipca") {
    errors.set("indexer", "Escolha como o saldo é corrigido.");
  }
}

function interestStep(v: FormValues, errors: StepErrors) {
  v.contractRates.forEach((row, i) => {
    if (i > 0 && row.effectiveFrom === "") {
      errors.set(`contract_rates[${i}].effective_from`, "Informe a data da mudança.");
    }
    const rate = percent(row.rate);
    const key = `contract_rates[${i}].rate`;
    const what = i === 0 ? "a taxa de juros anual" : "a nova taxa";
    if (rate === "empty") errors.set(key, `Informe ${what}, como 9,5.`);
    else if (rate === "malformed") errors.set(key, "A taxa é um número, como 9,5.");
    else if (rate === "zero") errors.set(key, "A taxa precisa ser maior que zero.");
  });
}

function insuranceStep(v: FormValues, errors: StepErrors) {
  const appraisal = money(v.appraisalValue);
  if (appraisal === "empty") {
    errors.set("appraisal_value", "Informe o valor de avaliação do imóvel.");
  } else if (appraisal === "malformed") {
    errors.set("appraisal_value", "Use só números, como 400.000,00.");
  } else if (appraisal === "zero") {
    errors.set("appraisal_value", "O valor de avaliação precisa ser maior que zero.");
  }

  for (const [list, name] of [
    ["mip_rates", "MIP"],
    ["dfi_rates", "DFI"],
  ] as const) {
    const rows = list === "mip_rates" ? v.mipRates : v.dfiRates;
    const rate = rows[0].rate.trim();
    const key = `${list}[0].rate`;
    if (rate === "") errors.set(key, `Informe a taxa do ${name} ao mês, como 0,03.`);
    else if (!PERCENT.test(rate.replace(",", "."))) {
      errors.set(key, "A taxa é um número, como 0,03.");
    }
  }

  const fee = v.fees[0].amount.trim();
  if (fee !== "" && !MONEY.test(inputToMoney(fee))) {
    errors.set("fees[0].amount", "Use só números, como 25,00.");
  }
}

const checks = [contractStep, undefined, indexerStep, interestStep, insuranceStep] as const;

/** checkStep is what is wrong with a numbered step's fields, empty when it can go on. */
export function checkStep(step: number, values: FormValues): StepErrors {
  const errors: StepErrors = new Map();
  checks[step - 1]?.(values, errors);
  return errors;
}

const fieldLocations: Record<string, string> = {
  contractDate: "contract_date",
  originalAmount: "original_amount",
  termMonths: "term_months",
  firstInstallmentDate: "first_installment_date",
  amortizationSystem: "amortization_system",
  indexer: "indexer",
  appraisalValue: "appraisal_value",
  contractRates: "contract_rates",
  mipRates: "mip_rates",
  dfiRates: "dfi_rates",
  fees: "fees",
  firstInstallmentMip: "mip_rates",
  firstInstallmentDfi: "dfi_rates",
};

const rowLists = ["contract_rates", "mip_rates", "dfi_rates", "fees"];

/**
 * changedLocations tells which error locations a change from `before` to `after` makes out of
 * date: the field's own, those of the rows that changed (all of a list's when a row came or went),
 * and the ones that depend on the dates.
 */
export function changedLocations(
  before: FormValues,
  after: FormValues,
): (location: string) => boolean {
  const own = new Set<string>();
  const rowPrefixes: string[] = [];

  for (const key of Object.keys(fieldLocations) as (keyof FormValues)[]) {
    const was = before[key];
    const now = after[key];
    if (was === now) continue;
    const base = fieldLocations[key];
    if (!Array.isArray(was) || !Array.isArray(now)) {
      own.add(base);
      // "Before the contract" depends on both dates; "missing" depends on its own alone.
      if (key === "contractDate" && after.firstInstallmentDate !== "") {
        own.add("first_installment_date");
      }
      if (key === "firstInstallmentDate") for (const list of rowLists) own.add(list);
      continue;
    }
    if (was.length !== now.length) {
      rowPrefixes.push(base);
      continue;
    }
    now.forEach((row, i) => {
      if (JSON.stringify(row) !== JSON.stringify(was[i])) {
        own.add(base);
        rowPrefixes.push(`${base}[${i}]`);
      }
    });
  }

  return (location) =>
    own.has(location) || rowPrefixes.some((prefix) => location.startsWith(prefix));
}
