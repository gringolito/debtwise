import { inputToMoney } from "@/lib/format";
import { type FormValues, unchosenIndexer } from "@/lib/mortgageForm";

/**
 * FieldErrors holds a message per field, at the location the API names the field by:
 * "contract_date", "contract_rates[1].rate". The steps ask for them through the same `messageOf`
 * whether the browser or the API found the field wrong.
 */
export type FieldErrors = Map<string, string>;

// The server's pattern for money: no leading zeros, up to 15 integer digits, up to two places.
const MONEY = /^(0|[1-9]\d{0,14})(\.\d{1,2})?$/;
const PERCENT = /^\d+([.,]\d+)?$/;
const POSITIVE = /[1-9]/;
const WHOLE_NUMBER = /^\d+$/;
const COMPLETE_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Reading = "empty" | "malformed" | "zero" | "ok";

function readMoney(text: string): Reading {
  if (text.trim() === "") return "empty";
  const amount = inputToMoney(text);
  if (!MONEY.test(amount)) return "malformed";
  return POSITIVE.test(amount) ? "ok" : "zero";
}

function readPercent(text: string): Reading {
  const rate = text.trim();
  if (rate === "") return "empty";
  if (!PERCENT.test(rate)) return "malformed";
  return POSITIVE.test(rate) ? "ok" : "zero";
}

function contractStep(values: FormValues, errors: FieldErrors) {
  const { contractDate, firstInstallmentDate } = values;
  if (!COMPLETE_DATE.test(contractDate)) errors.set("contract_date", "Informe a data do contrato.");

  const amount = readMoney(values.originalAmount);
  if (amount === "empty") errors.set("original_amount", "Informe o valor financiado.");
  else if (amount === "malformed")
    errors.set("original_amount", "Use só números, como 250.000,00.");
  else if (amount === "zero")
    errors.set("original_amount", "O valor financiado precisa ser maior que zero.");

  const term = values.termMonths.trim();
  if (term === "") errors.set("term_months", "Informe o prazo em meses, como 420.");
  else if (!WHOLE_NUMBER.test(term)) errors.set("term_months", "O prazo é em meses, como 420.");
  else if (Number(term) < 1 || Number(term) > 600)
    errors.set("term_months", "O prazo vai de 1 a 600 meses.");

  if (!COMPLETE_DATE.test(firstInstallmentDate)) {
    errors.set("first_installment_date", "Informe a data da primeira prestação.");
  } else if (COMPLETE_DATE.test(contractDate) && firstInstallmentDate < contractDate) {
    errors.set(
      "first_installment_date",
      "A primeira prestação não pode ser antes da data do contrato.",
    );
  }
}

function indexerStep(values: FormValues, errors: FieldErrors) {
  if (values.indexer === unchosenIndexer) {
    errors.set("indexer", "Escolha como o saldo é corrigido.");
  }
}

function interestStep(values: FormValues, errors: FieldErrors) {
  values.contractRates.forEach((row, i) => {
    if (i > 0 && !COMPLETE_DATE.test(row.effectiveFrom)) {
      errors.set(`contract_rates[${i}].effective_from`, "Informe a data da mudança.");
    }
    const location = `contract_rates[${i}].rate`;
    const rate = readPercent(row.rate);
    if (rate === "empty") {
      errors.set(
        location,
        `Informe ${i === 0 ? "a taxa de juros anual" : "a nova taxa"}, como 9,5.`,
      );
    } else if (rate === "malformed") errors.set(location, "A taxa é um número, como 9,5.");
    else if (rate === "zero") errors.set(location, "A taxa precisa ser maior que zero.");
  });
}

function insuranceStep(values: FormValues, errors: FieldErrors) {
  const appraisal = readMoney(values.appraisalValue);
  if (appraisal === "empty")
    errors.set("appraisal_value", "Informe o valor de avaliação do imóvel.");
  else if (appraisal === "malformed")
    errors.set("appraisal_value", "Use só números, como 400.000,00.");
  else if (appraisal === "zero")
    errors.set("appraisal_value", "O valor de avaliação precisa ser maior que zero.");

  // The API accepts a rate of zero for an insurance, so only its presence and format are asked.
  for (const [location, name, rows] of [
    ["mip_rates", "MIP", values.mipRates],
    ["dfi_rates", "DFI", values.dfiRates],
  ] as const) {
    const rate = readPercent(rows[0].rate);
    if (rate === "empty") {
      errors.set(`${location}[0].rate`, `Informe a taxa do ${name} ao mês, como 0,03.`);
    } else if (rate === "malformed") {
      errors.set(`${location}[0].rate`, "A taxa é um número, como 0,03.");
    }
  }

  // The fee is optional, and a fee left empty is none.
  const fee = values.fees[0].amount;
  if (fee.trim() !== "" && readMoney(fee) === "malformed") {
    errors.set("fees[0].amount", "Use só números, como 25,00.");
  }
}

const stepChecks = [contractStep, undefined, indexerStep, interestStep, insuranceStep] as const;

/**
 * checkStep is what the browser can tell is wrong with a numbered step's fields before it goes on:
 * what is missing or not a number, and dates that contradict each other. Empty when the step can
 * go on. Everything else is the API's to judge, at the review.
 */
export function checkStep(step: number, values: FormValues): FieldErrors {
  const errors: FieldErrors = new Map();
  stepChecks[step - 1]?.(values, errors);
  return errors;
}

const scalarLocations = {
  contractDate: "contract_date",
  originalAmount: "original_amount",
  termMonths: "term_months",
  firstInstallmentDate: "first_installment_date",
  amortizationSystem: "amortization_system",
  indexer: "indexer",
  appraisalValue: "appraisal_value",
} as const satisfies Partial<Record<keyof FormValues, string>>;

const listLocations = {
  contractRates: "contract_rates",
  mipRates: "mip_rates",
  dfiRates: "dfi_rates",
  fees: "fees",
} as const satisfies Partial<Record<keyof FormValues, string>>;

/**
 * staleLocations tells which locations a change from `before` to `after` leaves with an
 * out-of-date message: the changed field's own, the rows of a list that changed (all of a list's
 * when a row came or went, since the API names rows by position), and what depends on the dates.
 */
export function staleLocations(
  before: FormValues,
  after: FormValues,
): (location: string) => boolean {
  const exact = new Set<string>();
  const prefixes: string[] = [];

  for (const [key, location] of Object.entries(scalarLocations)) {
    if (
      before[key as keyof typeof scalarLocations] !== after[key as keyof typeof scalarLocations]
    ) {
      exact.add(location);
    }
  }
  // Whether the first installment is before the contract depends on both dates.
  if (before.contractDate !== after.contractDate && after.firstInstallmentDate !== "") {
    exact.add("first_installment_date");
  }
  // A list needs a row in force from the first installment, which its date decides.
  if (before.firstInstallmentDate !== after.firstInstallmentDate) {
    for (const location of Object.values(listLocations)) exact.add(location);
  }

  for (const [key, location] of Object.entries(listLocations)) {
    const was = before[key as keyof typeof listLocations];
    const now = after[key as keyof typeof listLocations];
    if (was.length !== now.length) {
      prefixes.push(location);
      continue;
    }
    now.forEach((row, i) => {
      if (JSON.stringify(row) !== JSON.stringify(was[i])) {
        exact.add(location);
        prefixes.push(`${location}[${i}].`);
      }
    });
  }

  return (location) =>
    exact.has(location) || prefixes.some((prefix) => location.startsWith(prefix));
}

/** withoutStale is the errors left once the stale ones go; the same map when none was. */
export function withoutStale(
  errors: FieldErrors,
  stale: (location: string) => boolean,
): FieldErrors {
  const kept = [...errors].filter(([location]) => !stale(location));
  return kept.length === errors.size ? errors : new Map(kept);
}
