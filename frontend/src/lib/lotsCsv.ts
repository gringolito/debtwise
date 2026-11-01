import { ApiError, type BondQuote, type LotInput } from "@/lib/api";
import { type BondType, bondKinds } from "@/lib/bondKinds";
import { inputToMoney, percentToFraction } from "@/lib/format";
import { lotFieldMessages } from "@/lib/lots";

/** CsvRow is one row of a lots file, its fields as the file writes them. */
export interface CsvRow {
  /** The row's line in the file, counting from 1 at the header. */
  line: number;
  /** Whether the row's quotes are unbalanced, so its fields can't be told apart. */
  malformed: boolean;
  bond: string;
  purchaseDate: string;
  rate: string;
  unitPrice: string;
  quantity: string;
}

/**
 * readLotsCsv reads a lots file exported from a spreadsheet: a header, then one lot a row with its
 * bond as Tesouro Direto names it ("Tesouro IPCA+ 2035"), purchase date (dd/mm/aaaa), rate as a
 * percent a year, unit price and quantity, separated by semicolons or by commas. Blank rows and
 * columns past the fifth are skipped.
 */
export function readLotsCsv(contents: string): CsvRow[] {
  const [header, ...rows] = csvRows(contents);
  const separator = header?.text.includes(";") ? ";" : ",";
  return rows.map(({ line, text }) => {
    const fields = csvFields(text, separator);
    const [bond = "", purchaseDate = "", rate = "", unitPrice = "", quantity = ""] = fields ?? [];
    return { line, malformed: !fields, bond, purchaseDate, rate, unitPrice, quantity };
  });
}

/** bondLabel names a bond of the catalogue the way Tesouro Direto does: "Tesouro IPCA+ 2035". */
export function bondLabel({ type, maturity }: Pick<BondQuote, "type" | "maturity">): string {
  return `${bondKinds[type].name} ${maturity.slice(0, 4)}`;
}

/** BondMatch is the catalogue bond a row's name names, or the closest one to suggest. */
export interface BondMatch {
  bond: BondQuote | null;
  exact: boolean;
}

// Below this similarity, a kind of bond is too far from the name to suggest: "Educa+" is 0.4 from
// "IPCA+", while "Prefixado Juros Semestrais" is 0.87 from "Prefixado com Juros Semestrais".
const SUGGESTION_THRESHOLD = 0.75;

/**
 * matchBond finds the catalogue bond named, case aside, by name. Failing that, it suggests the
 * bond maturing in the year name holds whose kind, by Tesouro Direto name or by code ("NTN-B
 * Principal"), is closest to the rest of name. It suggests none when name holds no year or when
 * even the closest kind is too far.
 */
export function matchBond(name: string, catalogue: BondQuote[]): BondMatch {
  const wanted = name.trim().toLowerCase();
  const exact = catalogue.find((b) => bondLabel(b).toLowerCase() === wanted);
  if (exact) return { bond: exact, exact: true };

  const year = /\b(\d{4})\b/.exec(name)?.[1];
  if (!year) return { bond: null, exact: false };
  const kind = kindOf(name.replace(year, ""));
  let best: { bond: BondQuote; score: number } | null = null;
  for (const bond of catalogue) {
    if (!bond.maturity.startsWith(year)) continue;
    const { name: tesouroName, code } = bondKinds[bond.type];
    const score = Math.max(similarity(kind, kindOf(tesouroName)), similarity(kind, kindOf(code)));
    if (!best || score > best.score) best = { bond, score };
  }
  return {
    bond: best && best.score >= SUGGESTION_THRESHOLD ? best.bond : null,
    exact: false,
  };
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

/**
 * A row the browser already knows is invalid: one with no catalogue bond picked, or one whose
 * quotes are unbalanced. It still goes to the API, which rejects it, so the owner hears of every
 * invalid row at once.
 */
export type RowProblem = "outside-catalogue" | "malformed";

/** ImportedRow is a row sent to the API, kept to read the API's rejection back onto the file. */
export interface ImportedRow {
  line: number;
  input: LotInput;
  problem: RowProblem | null;
}

const noType = "" as BondType;

const unreadable: LotInput = {
  type: noType,
  maturity: "",
  purchase_date: "",
  rate: "",
  unit_price: "",
  quantity: "",
};

/**
 * importedRow builds the lot row records with bond, the catalogue bond picked for it. Text the API
 * cannot read goes through for it to reject, and so does a row with no bond: its name is sent as
 * the type.
 */
export function importedRow(row: CsvRow, bond: BondQuote | null): ImportedRow {
  if (row.malformed) return { line: row.line, input: unreadable, problem: "malformed" };
  const unknownType = row.bond as BondType;
  return {
    line: row.line,
    problem: bond ? null : "outside-catalogue",
    input: {
      type: bond?.type ?? unknownType,
      maturity: bond?.maturity ?? "",
      purchase_date: isoDate(row.purchaseDate),
      rate: percentToFraction(row.rate.trim().replace(/%$/, "")),
      unit_price: inputToMoney(row.unitPrice.trim().replace(/^R\$\s*/, "")),
      quantity: inputToMoney(row.quantity),
    },
  };
}

/** InvalidRow is a row of the file the owner has to fix, with why. */
export interface InvalidRow {
  line: number;
  messages: string[];
}

export const problemMessages: Record<RowProblem, string> = {
  "outside-catalogue": "Título fora do catálogo.",
  malformed: "Aspas sem par: a linha não pode ser lida.",
};

/** The API fields a row's problem already explains, whose rejections the owner needn't read. */
const explainedFields: Record<RowProblem, (field: string) => boolean> = {
  "outside-catalogue": (field) => field === "type" || field === "maturity",
  malformed: () => true,
};

const importMessages: Record<string, string> = {
  ...lotFieldMessages,
  maturity: "O título vence antes da data da compra.",
  purchase_date: "Informe a data da compra (dd/mm/aaaa), que não pode ser futura.",
};

const lotLocation = /^body\.lots\[(\d+)\]\.(\w+)$/;

/**
 * importErrors reads a rejected import of rows as the rows the owner has to fix, in file order.
 * Any other failure gives none.
 */
export function importErrors(error: Error | null, rows: ImportedRow[]): InvalidRow[] {
  if (!(error instanceof ApiError) || error.status !== 422) return [];
  const messages = new Map<ImportedRow, Set<string>>();
  for (const row of rows) {
    if (row.problem) messages.set(row, new Set([problemMessages[row.problem]]));
  }
  for (const location of error.locations) {
    const match = lotLocation.exec(location);
    const row = match && rows[Number(match[1])];
    if (!match || !row) continue;
    const field = match[2];
    if (row.problem && explainedFields[row.problem](field)) continue;
    const rowMessages = messages.get(row) ?? new Set<string>();
    rowMessages.add(importMessages[field] ?? "Valor inválido.");
    messages.set(row, rowMessages);
  }
  return rows
    .filter((row) => messages.has(row))
    .map((row) => ({ line: row.line, messages: [...(messages.get(row) ?? [])] }));
}

function csvRows(contents: string): { line: number; text: string }[] {
  return contents
    .split(/\r?\n/)
    .map((text, i) => ({ line: i + 1, text }))
    .filter(({ text }) => text.trim() !== "");
}

/**
 * csvFields splits a row on separator the RFC 4180 way: a field may be quoted to hold separators,
 * with "" for a quote inside it. A quote anywhere else, or one left open, gives null.
 */
function csvFields(row: string, separator: string): string[] | null {
  const fields: string[] = [];
  let i = 0;
  for (;;) {
    let field = "";
    if (row[i] === '"') {
      i++;
      for (;;) {
        if (i >= row.length) return null;
        if (row[i] === '"' && row[i + 1] === '"') {
          field += '"';
          i += 2;
        } else if (row[i] === '"') {
          i++;
          break;
        } else {
          field += row[i++];
        }
      }
      if (i < row.length && row[i] !== separator) return null;
    } else {
      const end = row.indexOf(separator, i);
      field = row.slice(i, end === -1 ? row.length : end);
      if (field.includes('"')) return null;
      i = end === -1 ? row.length : end;
    }
    fields.push(field);
    if (i >= row.length) return fields;
    i++;
  }
}

/** isoDate turns "02/01/2026" into "2026-01-02"; other text comes back for the API to reject. */
function isoDate(text: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return text;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}
