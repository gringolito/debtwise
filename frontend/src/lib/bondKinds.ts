import type { BondQuote } from "@/lib/api";
import { formatRate } from "@/lib/format";

export type BondType = BondQuote["type"];

// The API sends the type and maturity; Tesouro Direto's name and the bond's code are written here,
// as its names carry only those two facts. IPCA+ rates are real rates over IPCA.
export const bondKinds: Record<BondType, { name: string; code: string; ipcaLinked: boolean }> = {
  ltn: { name: "Tesouro Prefixado", code: "LTN", ipcaLinked: false },
  ntn_f: { name: "Tesouro Prefixado com Juros Semestrais", code: "NTN-F", ipcaLinked: false },
  ntn_b_principal: { name: "Tesouro IPCA+", code: "NTN-B Principal", ipcaLinked: true },
  ntn_b: { name: "Tesouro IPCA+ com Juros Semestrais", code: "NTN-B", ipcaLinked: true },
};

export const bondTypeOptions = (Object.entries(bondKinds) as [BondType, { name: string }][]).map(
  ([value, { name }]) => ({ value, label: name }),
);

/** bondLabel names a bond the way Tesouro Direto does: "Tesouro IPCA+ 2035". */
export function bondLabel({ type, maturity }: Pick<BondQuote, "type" | "maturity">): string {
  return `${bondKinds[type].name} ${maturity.slice(0, 4)}`;
}

/** bondRate writes a yearly rate the way Tesouro does: IPCA+ ones as a real rate over IPCA. */
export function bondRate(type: BondType, rate: string): string {
  return bondKinds[type].ipcaLinked ? `IPCA + ${formatRate(rate)}` : formatRate(rate);
}
