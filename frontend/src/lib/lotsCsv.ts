import { ApiError, type BondQuote, type LotInput } from "@/lib/api";
import { type BondType, bondKinds } from "@/lib/bondKinds";
import { inputToMoney, percentToFraction } from "@/lib/format";
import { lotFieldMessages } from "@/lib/lots";

/**
 * A row the browser already knows is invalid: one outside the catalogue, or one whose quotes are
 * unbalanced, so its fields can't be told apart. It still goes to the API, which rejects it, so the
 * owner hears of every invalid row at once.
 */
type RowProblem = "outside-catalogue" | "malformed";

/** CsvLot is one row of a lots file, read into the lot it records. */
export interface CsvLot {
  /** The row's line in the file, counting from 1 at the header. */
  line: number;
  input: LotInput;
  problem: RowProblem | null;
}

/**
 * readLotsCsv reads a lots file exported from a spreadsheet: a header, then one lot a row with its
 * bond as Tesouro Direto names it ("Tesouro IPCA+ 2035"), purchase date (dd/mm/aaaa), rate as a
 * percent a year, unit price and quantity, separated by semicolons or by commas. Blank rows and
 * columns past the fifth are skipped. Text the API cannot read goes through for it to reject.
 */
export function readLotsCsv(contents: string, catalogue: BondQuote[]): CsvLot[] {
  const bonds = new Map(catalogue.map((b) => [bondName(b.type, b.maturity), b]));
  const [header, ...rows] = csvRows(contents);
  const separator = header?.text.includes(";") ? ";" : ",";
  return rows.map(({ line, text }) => {
    const fields = csvFields(text, separator);
    if (!fields) return { line, input: unreadable, problem: "malformed" };
    const [name = "", purchaseDate = "", rate = "", unitPrice = "", quantity = ""] = fields;
    const bond = bonds.get(name.trim().toLowerCase());
    // A name outside the catalogue is sent as the type, which the API rejects.
    const unknownType = name as BondType;
    return {
      line,
      problem: bond ? null : "outside-catalogue",
      input: {
        type: bond?.type ?? unknownType,
        maturity: bond?.maturity ?? "",
        purchase_date: isoDate(purchaseDate),
        rate: percentToFraction(rate.trim().replace(/%$/, "")),
        unit_price: inputToMoney(unitPrice.trim().replace(/^R\$\s*/, "")),
        quantity: inputToMoney(quantity),
      },
    };
  });
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

/** InvalidRow is a row of the file the owner has to fix, with why. */
export interface InvalidRow {
  line: number;
  messages: string[];
}

const problemMessages: Record<RowProblem, string> = {
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
export function importErrors(error: Error | null, rows: CsvLot[]): InvalidRow[] {
  if (!(error instanceof ApiError) || error.status !== 422) return [];
  const messages = new Map<CsvLot, Set<string>>();
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

function bondName(type: BondType, maturity: string): string {
  return `${bondKinds[type].name} ${maturity.slice(0, 4)}`.toLowerCase();
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
