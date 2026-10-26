import type { IndexName } from "@/lib/api";

export const indexNames: Record<IndexName, string> = {
  tr: "TR",
  poupanca_yield: "Remuneração da poupança",
  selic_target: "Selic meta",
  selic: "Selic diária",
  ipca: "IPCA",
  ipca_number: "IPCA (número-índice)",
};
