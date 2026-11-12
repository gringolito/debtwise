import { describe, expect, it } from "vitest";
import { blankContractRate, type FormValues } from "@/lib/mortgageForm";
import { onboardingValues } from "@/lib/onboarding";
import { checkStep, staleLocations, withoutStale } from "@/lib/onboardingChecks";

/** What an owner who answered every step with a mortgage from the contract has typed. */
function answered(patch: Partial<FormValues> = {}): FormValues {
  const values = onboardingValues();
  const [rate] = values.contractRates;
  return {
    ...values,
    contractDate: "2023-12-10",
    originalAmount: "60.000,00",
    termMonths: "6",
    firstInstallmentDate: "2024-01-10",
    indexer: "tr",
    appraisalValue: "100.000,00",
    contractRates: [{ ...rate, rate: "9,5" }],
    mipRates: values.mipRates.map((row) => ({ ...row, rate: "0,0258" })),
    dfiRates: values.dfiRates.map((row) => ({ ...row, rate: "0,01" })),
    ...patch,
  };
}

const errorsOf = (step: number, values: FormValues) => Object.fromEntries(checkStep(step, values));

describe("the contract step", () => {
  it("lets terms that are complete and in order go on", () => {
    expect(errorsOf(1, answered())).toEqual({});
  });

  it("lets the first installment fall on the contract date", () => {
    expect(errorsOf(1, answered({ firstInstallmentDate: "2023-12-10" }))).toEqual({});
  });

  it("asks for every field of an empty step, naming each", () => {
    expect(errorsOf(1, onboardingValues())).toEqual({
      contract_date: "Informe a data do contrato.",
      original_amount: "Informe o valor financiado.",
      term_months: "Informe o prazo em meses, como 420.",
      first_installment_date: "Informe a data da primeira prestação.",
    });
  });

  it.each([
    ["is no number", { originalAmount: "muito" }, "Use só números, como 250.000,00."],
    ["has three places", { originalAmount: "1.000,123" }, "Use só números, como 250.000,00."],
    ["is zero", { originalAmount: "0,00" }, "O valor financiado precisa ser maior que zero."],
  ])("rejects an original amount that %s", (_, patch, message) => {
    expect(errorsOf(1, answered(patch))).toEqual({ original_amount: message });
  });

  it.each([
    ["is not whole", "6,5", "O prazo é em meses, como 420."],
    ["has a unit", "420 meses", "O prazo é em meses, como 420."],
    ["is zero", "0", "O prazo vai de 1 a 600 meses."],
    ["is over 600", "601", "O prazo vai de 1 a 600 meses."],
  ])("rejects a term that %s", (_, termMonths, message) => {
    expect(errorsOf(1, answered({ termMonths }))).toEqual({ term_months: message });
  });

  it.each(["1", "420", "600"])("accepts a term of %s months", (termMonths) => {
    expect(errorsOf(1, answered({ termMonths }))).toEqual({});
  });

  it("rejects a first installment before the contract date", () => {
    expect(errorsOf(1, answered({ firstInstallmentDate: "2023-12-09" }))).toEqual({
      first_installment_date: "A primeira prestação não pode ser antes da data do contrato.",
    });
  });

  it("does not compare the dates while the contract date is missing", () => {
    expect(errorsOf(1, answered({ contractDate: "" }))).toEqual({
      contract_date: "Informe a data do contrato.",
    });
  });
});

describe("the amortization system step", () => {
  it("asks for nothing, since SAC is already chosen", () => {
    expect(onboardingValues().amortizationSystem).toBe("sac");
    expect(errorsOf(2, onboardingValues())).toEqual({});
  });
});

describe("the indexer step", () => {
  it("starts with no choice, and asks for one", () => {
    expect(errorsOf(3, onboardingValues())).toEqual({
      indexer: "Escolha como o saldo é corrigido.",
    });
  });

  it.each(["none", "tr", "ipca"] as const)("lets %s go on", (indexer) => {
    expect(errorsOf(3, answered({ indexer }))).toEqual({});
  });
});

describe("the interest step", () => {
  const withRates = (...rows: { effectiveFrom?: string; rate: string }[]) =>
    answered({ contractRates: rows.map((row) => ({ ...blankContractRate(), ...row })) });

  it("lets a rate and a dated change go on", () => {
    expect(
      errorsOf(4, withRates({ rate: "9,5" }, { effectiveFrom: "2024-04-10", rate: "8" })),
    ).toEqual({});
  });

  it.each([
    ["is missing", "", "Informe a taxa de juros anual, como 9,5."],
    ["is no number", "alta", "A taxa é um número, como 9,5."],
    ["is zero", "0,00", "A taxa precisa ser maior que zero."],
  ])("rejects a rate that %s", (_, rate, message) => {
    expect(errorsOf(4, withRates({ rate }))).toEqual({ "contract_rates[0].rate": message });
  });

  it("asks a change for its date and its rate, by its place in the list", () => {
    expect(errorsOf(4, withRates({ rate: "9,5" }, { rate: "" }))).toEqual({
      "contract_rates[1].effective_from": "Informe a data da mudança.",
      "contract_rates[1].rate": "Informe a nova taxa, como 9,5.",
    });
  });
});

describe("the insurance step", () => {
  it("lets complete terms go on, with the admin fee empty", () => {
    expect(errorsOf(5, answered())).toEqual({});
  });

  it("asks for the appraisal value and both rates of an empty step, and not for the fee", () => {
    expect(errorsOf(5, onboardingValues())).toEqual({
      appraisal_value: "Informe o valor de avaliação do imóvel.",
      "mip_rates[0].rate": "Informe a taxa do MIP ao mês, como 0,03.",
      "dfi_rates[0].rate": "Informe a taxa do DFI ao mês, como 0,03.",
    });
  });

  it.each([
    ["is no number", "caro", "Use só números, como 400.000,00."],
    ["is zero", "0", "O valor de avaliação precisa ser maior que zero."],
  ])("rejects an appraisal value that %s", (_, appraisalValue, message) => {
    expect(errorsOf(5, answered({ appraisalValue }))).toEqual({ appraisal_value: message });
  });

  it("rejects an insurance rate that is no number, and accepts a rate of zero", () => {
    const values = answered();
    expect(
      errorsOf(
        5,
        answered({
          mipRates: values.mipRates.map((row) => ({ ...row, rate: "alta" })),
          dfiRates: values.dfiRates.map((row) => ({ ...row, rate: "0" })),
        }),
      ),
    ).toEqual({ "mip_rates[0].rate": "A taxa é um número, como 0,03." });
  });

  it.each([
    ["25,90", {}],
    ["0", {}],
    ["", {}],
    ["muito", { "fees[0].amount": "Use só números, como 25,00." }],
  ])("reads an admin fee of %j", (amount, expected) => {
    const values = answered();
    expect(
      errorsOf(5, { ...values, fees: values.fees.map((fee) => ({ ...fee, amount })) }),
    ).toEqual(expected);
  });
});

describe("the messages a change leaves out of date", () => {
  const stale = (before: FormValues, after: FormValues, ...locations: string[]) =>
    locations.filter(staleLocations(before, after));

  it("are the changed field's own, and no other", () => {
    expect(
      stale(
        answered(),
        answered({ originalAmount: "70.000,00" }),
        "original_amount",
        "term_months",
        "contract_date",
      ),
    ).toEqual(["original_amount"]);
  });

  it("include the first installment's, once either date changes", () => {
    const before = answered();
    expect(
      stale(before, answered({ contractDate: "2023-12-01" }), "first_installment_date"),
    ).toEqual(["first_installment_date"]);
    expect(
      stale(
        before,
        answered({ firstInstallmentDate: "2024-02-10" }),
        "first_installment_date",
        "dfi_rates",
      ),
    ).toEqual(["first_installment_date", "dfi_rates"]);
  });

  it("are those of the row changed in a list, and of the list", () => {
    const before = answered({
      contractRates: [
        { ...blankContractRate(), rate: "9" },
        { ...blankContractRate(), rate: "8" },
      ],
    });
    const after = {
      ...before,
      contractRates: [before.contractRates[0], { ...before.contractRates[1], rate: "7" }],
    };

    expect(
      stale(
        before,
        after,
        "contract_rates",
        "contract_rates[0].rate",
        "contract_rates[1].rate",
        "contract_rates[1].effective_from",
      ),
    ).toEqual(["contract_rates", "contract_rates[1].rate", "contract_rates[1].effective_from"]);
  });

  it("are all of a list's once a row is added or removed, since the API names rows by place", () => {
    const before = answered();
    const after = { ...before, contractRates: [...before.contractRates, blankContractRate()] };

    expect(
      stale(before, after, "contract_rates", "contract_rates[0].rate", "mip_rates[0].rate"),
    ).toEqual(["contract_rates", "contract_rates[0].rate"]);
  });

  it("drop from the errors, which stay the same map when none was stale", () => {
    const errors = new Map([
      ["original_amount", "a"],
      ["term_months", "b"],
    ]);

    expect(withoutStale(errors, (location) => location === "term_months")).toEqual(
      new Map([["original_amount", "a"]]),
    );
    expect(withoutStale(errors, () => false)).toBe(errors);
  });
});
