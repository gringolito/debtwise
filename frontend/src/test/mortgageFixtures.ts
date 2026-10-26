import type { RegisteredMortgage, Schedule } from "@/lib/api";

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
      interest: "600.00",
      amortization: "10000.00",
      mip: "18.00",
      dfi: "10.00",
      fee: "12.50",
      amount: "10640.50",
      outstanding_balance: "50000.00",
    },
    {
      number: 2,
      due_date: "2024-02-10",
      correction: "0.00",
      index_values: [],
      interest: "500.00",
      amortization: "10000.00",
      mip: "15.00",
      dfi: "10.00",
      fee: "12.50",
      amount: "10537.50",
      outstanding_balance: "40000.00",
    },
    {
      number: 3,
      due_date: "2024-03-10",
      correction: "0.00",
      index_values: [],
      interest: "400.00",
      amortization: "10000.00",
      mip: "12.00",
      dfi: "10.00",
      fee: "12.50",
      amount: "10434.50",
      outstanding_balance: "30000.00",
    },
    {
      number: 4,
      due_date: "2024-04-10",
      correction: "0.00",
      index_values: [],
      interest: "300.00",
      amortization: "10000.00",
      mip: "15.00",
      dfi: "10.00",
      fee: "12.50",
      amount: "10337.50",
      outstanding_balance: "20000.00",
    },
    {
      number: 5,
      due_date: "2024-05-10",
      correction: "0.00",
      index_values: [],
      interest: "200.00",
      amortization: "10000.00",
      mip: "10.00",
      dfi: "10.00",
      fee: "12.50",
      amount: "10232.50",
      outstanding_balance: "10000.00",
    },
    {
      number: 6,
      due_date: "2024-06-10",
      correction: "0.00",
      index_values: [],
      interest: "100.00",
      amortization: "10000.00",
      mip: "5.00",
      dfi: "10.00",
      fee: "12.50",
      amount: "10127.50",
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
      interest: "700.00",
      amortization: "60000.00",
      mip: "21.00",
      dfi: "11.00",
      fee: "13.00",
      amount: "60745.00",
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
        },
      ],
      interest: "603.23",
      amortization: "10000.00",
      mip: "18.00",
      dfi: "10.00",
      fee: "12.50",
      amount: "10643.73",
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
        },
      ],
      interest: "500.00",
      amortization: "10000.00",
      mip: "15.00",
      dfi: "10.00",
      fee: "12.50",
      amount: "10537.50",
      outstanding_balance: "40032.34",
    },
    {
      number: 3,
      due_date: "2024-03-10",
      correction: "0.00",
      index_values: [],
      interest: "400.00",
      amortization: "10000.00",
      mip: "12.00",
      dfi: "10.00",
      fee: "12.50",
      amount: "10434.50",
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
        },
      ],
      interest: "603.23",
      amortization: "10000.00",
      mip: "18.00",
      dfi: "10.00",
      fee: "12.50",
      amount: "10643.73",
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
        },
        {
          index: "tr",
          status: "missing",
          period_start: "2024-01-10",
          period_end: "2024-02-10",
        },
        {
          index: "tr",
          status: "published",
          value: "0.2166",
          period_start: "2024-02-10",
          period_end: "2024-03-10",
        },
      ],
      interest: "603.23",
      amortization: "10000.00",
      mip: "18.00",
      dfi: "10.00",
      fee: "12.50",
      amount: "10643.73",
      outstanding_balance: "50108.30",
    },
  ],
};
