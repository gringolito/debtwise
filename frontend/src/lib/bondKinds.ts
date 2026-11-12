import type { BondQuote, RegisteredMortgage } from "@/lib/api";

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

// Tesouro quotes a bond's rate to two places, whatever more the API computes ("0.1398663" is
// "13,99%"). Intl formats the decimal string exactly.
const rateFormat = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** bondRate writes a yearly rate the way Tesouro does: IPCA+ ones as a real rate over IPCA. */
export function bondRate(type: BondType, rate: string): string {
  const percent = rateFormat.format(rate as `${number}`);
  return bondKinds[type].ipcaLinked ? `IPCA + ${percent}` : percent;
}

/**
 * comparesWith says whether a decision compares a bond of this type against prepaying a mortgage
 * corrected by indexer: IPCA+ bonds for an IPCA mortgage, prefixados otherwise (ADR-0007).
 */
export function comparesWith(type: BondType, indexer: RegisteredMortgage["indexer"]): boolean {
  return bondKinds[type].ipcaLinked === (indexer === "ipca");
}
