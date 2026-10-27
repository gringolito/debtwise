import type { BondQuote } from "@/lib/api";
import { formatRate } from "@/lib/format";

export type BondType = BondQuote["type"];

// The API sends the type and maturity; Tesouro Direto's name is written here, as its names carry
// only those two facts. IPCA+ rates are real rates over IPCA.
export const bondKinds: Record<BondType, { name: string; ipcaLinked: boolean }> = {
  ltn: { name: "Tesouro Prefixado", ipcaLinked: false },
  ntn_f: { name: "Tesouro Prefixado com Juros Semestrais", ipcaLinked: false },
  ntn_b_principal: { name: "Tesouro IPCA+", ipcaLinked: true },
  ntn_b: { name: "Tesouro IPCA+ com Juros Semestrais", ipcaLinked: true },
};

export const bondTypeOptions = (Object.entries(bondKinds) as [BondType, { name: string }][]).map(
  ([value, { name }]) => ({ value, label: name }),
);

/** bondRate writes a yearly rate the way Tesouro does: IPCA+ ones as a real rate over IPCA. */
export function bondRate(type: BondType, rate: string): string {
  return bondKinds[type].ipcaLinked ? `IPCA + ${formatRate(rate)}` : formatRate(rate);
}
