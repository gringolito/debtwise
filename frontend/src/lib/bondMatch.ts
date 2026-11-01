import type { BondQuote } from "@/lib/api";
import { bondKinds, bondLabel } from "@/lib/bondKinds";

/** BondMatch is the catalogue bond a name names, or the closest one to suggest, if any. */
export type BondMatch = { exact: BondQuote } | { suggested: BondQuote | null };

// Below this similarity, a kind of bond is too far from a name to suggest: "Educa+" is 0.4 from
// "IPCA+", while "Prefixado Juros Semestrais" is 0.87 from "Prefixado com Juros Semestrais".
const SUGGESTION_THRESHOLD = 0.75;

/**
 * matchBond finds the catalogue bond named, case and padding aside, by name. Failing that, it
 * suggests the bond maturing in the year name holds whose kind is the one name's code ("NTN-B
 * Principal") gives, or else whose Tesouro Direto name is closest to the rest of name. It suggests
 * none when name holds no year or when even the closest kind is too far. Codes are compared
 * exactly: "NTN-B" is one edit away from "NTN-F", a different bond.
 */
export function matchBond(name: string, catalogue: BondQuote[]): BondMatch {
  const wanted = name.trim().toLowerCase();
  const exact = catalogue.find((b) => bondLabel(b).toLowerCase() === wanted);
  if (exact) return { exact };

  const year = /\b(\d{4})\b/.exec(name)?.[1];
  if (!year) return { suggested: null };
  const kind = kindOf(name.replace(year, ""));
  const sameYear = catalogue.filter((b) => b.maturity.startsWith(year));
  const byCode = sameYear.find((b) => kindOf(bondKinds[b.type].code) === kind);
  if (byCode) return { suggested: byCode };

  let best: { bond: BondQuote; score: number } | null = null;
  for (const bond of sameYear) {
    const score = similarity(kind, kindOf(bondKinds[bond.type].name));
    if (!best || score > best.score) best = { bond, score };
  }
  return { suggested: best && best.score >= SUGGESTION_THRESHOLD ? best.bond : null };
}

/**
 * kindOf reduces a bond's name to what tells its kind apart, without case, accents, punctuation
 * or the "Tesouro" every name starts with: "Tesouro IPCA+" is "ipca", "NTN-B" is "ntn b".
 */
function kindOf(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\btesouro\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** similarity is 1 less the Levenshtein distance between a and b over the longer one's length. */
function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution);
    }
    previous = current;
  }
  return 1 - previous[b.length] / longest;
}
