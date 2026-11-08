import type { IndexName, IndexValue, ProjectionMethodName } from "@/lib/api";
import {
  formatDate,
  formatMonth,
  formatMonthYear,
  formatNumber,
  formatPercent,
  formatPeriod,
} from "@/lib/format";

interface IndexInfo {
  /** One line on what the index is, under its name in the list. */
  summary: string;
  /** One sentence on what the index is, under its name on its page. */
  description: string;
  /** The unit after a value, such as "ao mês"; empty for the IPCA index number. */
  unit: string;
  /** Whether the index has one value a month, dated by the month alone. */
  monthly: boolean;
  /** Whether DebtWise projects the index past its published values (ADR-0009). */
  projected: boolean;
}

export const marketIndexes: Record<IndexName, IndexInfo> = {
  tr: {
    summary: "Taxa Referencial",
    description: "Taxa Referencial, calculada pelo Banco Central.",
    unit: "ao mês",
    monthly: false,
    projected: true,
  },
  poupanca_yield: {
    summary: "Usada em parte dos contratos com TR",
    description: "Quanto rende a poupança, pela regra em vigor.",
    unit: "ao mês",
    monthly: false,
    projected: true,
  },
  selic_target: {
    summary: "Taxa básica de juros",
    description: "Taxa básica de juros, definida pelo Copom.",
    unit: "ao ano",
    monthly: false,
    projected: true,
  },
  selic: {
    summary: "Taxa média dos títulos públicos",
    description: "Taxa média das operações com títulos públicos, dia a dia.",
    unit: "ao dia",
    monthly: false,
    projected: false,
  },
  ipca: {
    summary: "Inflação oficial",
    description: "Inflação oficial, medida pelo IBGE.",
    unit: "no mês",
    monthly: true,
    projected: true,
  },
  ipca_number: {
    summary: "Base do valor dos títulos IPCA+",
    description: "O IPCA acumulado desde dezembro de 1993, que vale 100, medido pelo IBGE.",
    unit: "",
    monthly: true,
    projected: false,
  },
};

/** The summary of the index the mortgage corrects its balance by. */
export const MORTGAGE_INDEXER_SUMMARY = "Corrige o saldo do seu financiamento";

export function isIndexName(name: string): name is IndexName {
  return Object.hasOwn(marketIndexes, name);
}

/** indexValueText writes a value with its unit: "0,1683% ao mês", or "7.329,25" for the index number. */
export function indexValueText(index: IndexName, value: string): string {
  const { unit } = marketIndexes[index];
  return unit ? `${formatPercent(value)} ${unit}` : formatNumber(value);
}

type Period = Pick<IndexValue, "period_start" | "period_end">;

/** indexPeriodText dates a value briefly, for a list: "set/2026", "06/11/2026" or a range. */
export function indexPeriodText(index: IndexName, { period_start, period_end }: Period): string {
  if (marketIndexes[index].monthly) return formatMonth(period_start);
  return formatPeriod(period_start, period_end);
}

/** indexPeriodProse dates a value in a sentence: "em setembro de 2026", "de 06/10/2026 a 06/11/2026". */
export function indexPeriodProse(index: IndexName, { period_start, period_end }: Period): string {
  if (marketIndexes[index].monthly) return `em ${formatMonthYear(period_start)}`;
  if (period_start === period_end) return `em ${formatDate(period_start)}`;
  return `de ${formatPeriod(period_start, period_end)}`;
}

/** What each projection method assumes, under its name. */
export const projectionMethodDescriptions: Record<ProjectionMethodName, string> = {
  focus: "Expectativa dos economistas consultados pelo Banco Central.",
  trailing_12: "Repete a média do último ano.",
  trailing_60: "Suaviza variações recentes com a média de cinco anos.",
};
