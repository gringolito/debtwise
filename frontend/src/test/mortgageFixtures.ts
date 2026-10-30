import type { Prepayment, RegisteredMortgage, Schedule, StatementDrift } from "@/lib/api";

const FIXED_RATE = "0.126825030131969720661201";

// A six-month SAC mortgage of R$ 60.000,00 at 12% a year nominal. MIP rises on 2024-04-01. The
// admin fee and the DFI premium differ, so a screen that swaps their columns shows it.
export const registeredMortgage: RegisteredMortgage = {
  contract_date: "2023-12-10",
  original_amount: "60000.00",
  term_months: 6,
  first_installment_date: "2024-01-10",
  amortization_system: "sac",
  indexer: "none",
  appraisal_value: "100000.00",
  contract_rates: [
    {
      effective_from: "2023-12-10",
      basis: "nominal",
      nominal: "0.12",
      effective: "0.126825030131969720661201",
      poupanca_additional: false,
    },
  ],
  mip_rates: [
    { effective_from: "2023-12-10", rate: "0.0003" },
    { effective_from: "2024-04-01", rate: "0.0005" },
  ],
  dfi_rates: [{ effective_from: "2023-12-10", rate: "0.0001" }],
  fees: [{ effective_from: "2023-12-10", amount: "12.50" }],
};

export const schedule: Schedule = {
  installments: [
    {
      number: 1,
      due_date: "2024-01-10",
      correction: "0.00",
      index_values: [],
      rate: FIXED_RATE,
      rate_index_values: [],
      interest: "600.00",
      amortization: "10000.00",
      mip: "18.00",
      dfi: "10.00",
      fee: "12.50",
      amount: "10640.50",
      prepaid: "0.00",
      outstanding_balance: "50000.00",
    },
    {
      number: 2,
      due_date: "2024-02-10",
      correction: "0.00",
      index_values: [],
      rate: FIXED_RATE,
      rate_index_values: [],
      interest: "500.00",
      amortization: "10000.00",
      mip: "15.00",
      dfi: "10.00",
      fee: "12.50",
      amount: "10537.50",
      prepaid: "0.00",
      outstanding_balance: "40000.00",
    },
    {
      number: 3,
      due_date: "2024-03-10",
      correction: "0.00",
      index_values: [],
      rate: FIXED_RATE,
      rate_index_values: [],
      interest: "400.00",
      amortization: "10000.00",
      mip: "12.00",
      dfi: "10.00",
      fee: "12.50",
      amount: "10434.50",
      prepaid: "0.00",
      outstanding_balance: "30000.00",
    },
    {
      number: 4,
      due_date: "2024-04-10",
      correction: "0.00",
      index_values: [],
      rate: FIXED_RATE,
      rate_index_values: [],
      interest: "300.00",
      amortization: "10000.00",
      mip: "15.00",
      dfi: "10.00",
      fee: "12.50",
      amount: "10337.50",
      prepaid: "0.00",
      outstanding_balance: "20000.00",
    },
    {
      number: 5,
      due_date: "2024-05-10",
      correction: "0.00",
      index_values: [],
      rate: FIXED_RATE,
      rate_index_values: [],
      interest: "200.00",
      amortization: "10000.00",
      mip: "10.00",
      dfi: "10.00",
      fee: "12.50",
      amount: "10232.50",
      prepaid: "0.00",
      outstanding_balance: "10000.00",
    },
    {
      number: 6,
      due_date: "2024-06-10",
      correction: "0.00",
      index_values: [],
      rate: FIXED_RATE,
      rate_index_values: [],
      interest: "100.00",
      amortization: "10000.00",
      mip: "5.00",
      dfi: "10.00",
      fee: "12.50",
      amount: "10127.50",
      prepaid: "0.00",
      outstanding_balance: "0.00",
    },
  ],
};

// What the server answers once the mortgage is saved with a shorter term: one installment that
// shares no figure with `schedule`.
export const scheduleAfterSave: Schedule = {
  installments: [
    {
      number: 1,
      due_date: "2024-01-15",
      correction: "0.00",
      index_values: [],
      rate: FIXED_RATE,
      rate_index_values: [],
      interest: "700.00",
      amortization: "60000.00",
      mip: "21.00",
      dfi: "11.00",
      fee: "13.00",
      amount: "60745.00",
      prepaid: "0.00",
      outstanding_balance: "0.00",
    },
  ],
};

// A TR-indexed mortgage with the same terms. Installment 1 was corrected by TR; installment 2's
// TR is not published, so it was not corrected; installment 3 carries no index.
export const trMortgage: RegisteredMortgage = { ...registeredMortgage, indexer: "tr" };

export const trSchedule: Schedule = {
  installments: [
    {
      number: 1,
      due_date: "2024-01-10",
      correction: "32.34",
      index_values: [
        {
          index: "tr",
          status: "published",
          value: "0.0539",
          period_start: "2023-12-10",
          period_end: "2024-01-10",
          methods: [],
        },
      ],
      rate: FIXED_RATE,
      rate_index_values: [],
      interest: "603.23",
      amortization: "10000.00",
      mip: "18.00",
      dfi: "10.00",
      fee: "12.50",
      amount: "10643.73",
      prepaid: "0.00",
      outstanding_balance: "50032.34",
    },
    {
      number: 2,
      due_date: "2024-02-10",
      correction: "0.00",
      index_values: [
        {
          index: "tr",
          status: "missing",
          period_start: "2024-01-10",
          period_end: "2024-02-10",
          methods: [],
        },
      ],
      rate: FIXED_RATE,
      rate_index_values: [],
      interest: "500.00",
      amortization: "10000.00",
      mip: "15.00",
      dfi: "10.00",
      fee: "12.50",
      amount: "10537.50",
      prepaid: "0.00",
      outstanding_balance: "40032.34",
    },
    {
      number: 3,
      due_date: "2024-03-10",
      correction: "0.00",
      index_values: [],
      rate: FIXED_RATE,
      rate_index_values: [],
      interest: "400.00",
      amortization: "10000.00",
      mip: "12.00",
      dfi: "10.00",
      fee: "12.50",
      amount: "10434.50",
      prepaid: "0.00",
      outstanding_balance: "30032.34",
    },
  ],
};

// An IPCA-indexed mortgage: the value is for a calendar month, so the period is that month.
export const ipcaMortgage: RegisteredMortgage = { ...registeredMortgage, indexer: "ipca" };

export const ipcaSchedule: Schedule = {
  installments: [
    {
      number: 1,
      due_date: "2024-01-10",
      correction: "336.00",
      index_values: [
        {
          index: "ipca",
          status: "published",
          value: "0.56",
          period_start: "2023-12-01",
          period_end: "2023-12-01",
          methods: [],
        },
      ],
      rate: FIXED_RATE,
      rate_index_values: [],
      interest: "603.23",
      amortization: "10000.00",
      mip: "18.00",
      dfi: "10.00",
      fee: "12.50",
      amount: "10643.73",
      prepaid: "0.00",
      outstanding_balance: "50336.00",
    },
  ],
};

// A first installment deferred past three contract anniversaries: it is corrected by each month's
// value, two still missing and one published.
export const deferredSchedule: Schedule = {
  installments: [
    {
      number: 1,
      due_date: "2024-03-10",
      correction: "108.30",
      index_values: [
        {
          index: "tr",
          status: "missing",
          period_start: "2023-12-10",
          period_end: "2024-01-10",
          methods: [],
        },
        {
          index: "tr",
          status: "missing",
          period_start: "2024-01-10",
          period_end: "2024-02-10",
          methods: [],
        },
        {
          index: "tr",
          status: "published",
          value: "0.2166",
          period_start: "2024-02-10",
          period_end: "2024-03-10",
          methods: [],
        },
      ],
      rate: FIXED_RATE,
      rate_index_values: [],
      interest: "603.23",
      amortization: "10000.00",
      mip: "18.00",
      dfi: "10.00",
      fee: "12.50",
      amount: "10643.73",
      prepaid: "0.00",
      outstanding_balance: "50108.30",
    },
  ],
};

// A TR-indexed mortgage whose rate is 6% a year plus the poupança yield's additional part. The
// first installment's Selic target is published; the second's is not, so its rate is the fixed
// part alone.
export const poupancaMortgage: RegisteredMortgage = {
  ...trMortgage,
  contract_rates: [
    {
      effective_from: "2023-12-10",
      basis: "nominal",
      nominal: "0.06",
      effective: "0.0617",
      poupanca_additional: true,
    },
  ],
};

export const poupancaSchedule: Schedule = {
  installments: [
    {
      ...trSchedule.installments[0],
      rate: "0.1233778",
      rate_index_values: [
        {
          index: "selic_target",
          status: "published",
          value: "11.75",
          period_start: "2023-12-06",
          period_end: "2023-12-06",
          methods: [],
        },
      ],
    },
    {
      ...trSchedule.installments[2],
      number: 2,
      due_date: "2024-02-10",
      rate: "0.0617",
      rate_index_values: [
        {
          index: "selic_target",
          status: "missing",
          period_start: "2024-01-31",
          period_end: "2024-01-31",
          methods: [],
        },
      ],
    },
  ],
};

// An installment due after today: TR's correction and the Selic target that sets the rate's
// poupança part are both projected, each naming its method.
export const projectedSchedule: Schedule = {
  installments: [
    {
      ...trSchedule.installments[2],
      correction: "7.50",
      index_values: [
        {
          index: "tr",
          status: "projected",
          value: "0.0150",
          period_start: "2024-02-10",
          period_end: "2024-03-10",
          methods: [{ index: "tr", method: "trailing_12" }],
        },
      ],
      rate: "0.1191",
      rate_index_values: [
        {
          index: "selic_target",
          status: "projected",
          value: "10.50",
          period_start: "2024-02-29",
          period_end: "2024-02-29",
          methods: [{ index: "selic_target", method: "focus" }],
        },
      ],
    },
  ],
};

// Three prepayments in date order, one for each effect and amounts that need thousands separators.
export const prepayments: Prepayment[] = [
  { id: 1, date: "2024-02-20", amount: "5000.00", effect: "shorten_term" },
  { id: 2, date: "2024-03-15", amount: "12500.50", effect: "lower_installment" },
  { id: 3, date: "2024-04-02", amount: "1234.00", effect: "shorten_term" },
];

// Three statements in date order: the bank says more is owed, less is owed, and exactly what the
// schedule computed.
export const statements: StatementDrift[] = [
  {
    id: 1,
    date: "2024-02-20",
    outstanding_balance: "41000.00",
    computed_balance: "40000.00",
    drift: "1000.00",
  },
  {
    id: 2,
    date: "2024-04-10",
    outstanding_balance: "19500.00",
    computed_balance: "20000.00",
    drift: "-500.00",
  },
  {
    id: 3,
    date: "2024-05-10",
    outstanding_balance: "10000.00",
    computed_balance: "10000.00",
    drift: "0.00",
  },
];

// The schedule once a prepayment of R$ 5.000,00 is recorded between installments 2 and 3: the
// balance falls by that much from installment 2 on.
export const scheduleAfterEvent: Schedule = {
  installments: schedule.installments.map((installment) =>
    installment.number === 2
      ? { ...installment, prepaid: "5000.00", outstanding_balance: "35000.00" }
      : installment,
  ),
};
