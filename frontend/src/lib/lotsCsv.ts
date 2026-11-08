import { ApiError, type BondQuote, type LotInput } from "@/lib/api";
import type { BondType } from "@/lib/bondKinds";
import { inputToMoney, moneyToInput, percentToFraction } from "@/lib/format";
import { lotFieldMessages } from "@/lib/lots";
import { lotRuleMessage } from "@/lib/rules";

/** CsvRow is one row of a lots file, its fields as text: as the file writes them or as edited. */
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
 * importedRow builds the lot recorded for row, with bond, the catalogue bond picked for it. Text
 * the API cannot read goes through for it to reject, and so does a row with no bond: its name is
 * sent as the type.
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

const PLAIN_DECIMAL = /^\d+(\.\d+)?$/;

/**
 * asTyped writes a number the file gives the way the owner types it, thousands grouped: "2012.34",
 * "2012,34" and "R$ 2.012,34" all read "2.012,34", and "6,21%" reads "6,21". Text that is no
 * number comes back as the file gives it, for the owner to fix.
 */
export function asTyped(text: string): string {
  const decimal = inputToMoney(
    text
      .trim()
      .replace(/^R\$\s*/, "")
      .replace(/%$/, ""),
  );
  return PLAIN_DECIMAL.test(decimal) ? moneyToInput(decimal) : text;
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
  purchase_date: "Informe a data da compra (dd/mm/aaaa).",
};

// A rule's message says what it asks, not of which value; a row names the value it is about.
const fieldNames: Record<string, string> = {
  maturity: "Vencimento",
  purchase_date: "Data da compra",
  unit_price: "Preço unitário",
  quantity: "Quantidade",
};

const lotLocation = /^body\.lots\[(\d+)\]\.(\w+)$/;

/**
 * importErrors reads a rejected import of rows as the rows the owner has to fix, in file order:
 * what the rule each rejected value breaks asks, or what the field takes when the schema rejected
 * it. Any other failure gives none.
 */
export function importErrors(error: Error | null, rows: ImportedRow[]): InvalidRow[] {
  if (!(error instanceof ApiError) || error.status !== 422) return [];
  const messages = new Map<ImportedRow, Set<string>>();
  for (const row of rows) {
    if (row.problem) messages.set(row, new Set([problemMessages[row.problem]]));
  }
  for (const { location, rule } of error.rejected) {
    const match = lotLocation.exec(location);
    const row = match && rows[Number(match[1])];
    if (!match || !row) continue;
    const field = match[2];
    if (row.problem && explainedFields[row.problem](field)) continue;
    const rowMessages = messages.get(row) ?? new Set<string>();
    const reason = rule && lotRuleMessage(rule, row.input.type);
    rowMessages.add(
      reason
        ? `${fieldNames[field] ?? field}: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`
        : (importMessages[field] ?? "Valor inválido."),
    );
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
