import { Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { InlineInput } from "@/components/patterns/FieldRows";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { BondQuote } from "@/lib/api";
import { bondLabel } from "@/lib/bondKinds";
import { type CsvRow, problemMessages } from "@/lib/lotsCsv";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** PreviewRow is a row of a lots file, as the owner edits it, with the catalogue bond kept for it. */
export interface PreviewRow {
  row: CsvRow;
  /** Whether the file names the bond exactly, so there is no suggestion to check. */
  exact: boolean;
  bond: BondQuote | null;
}

/** bondKey tells the bonds of the catalogue apart as the value of an option. */
const bondKey = ({ type, maturity }: BondQuote) => `${type} ${maturity}`;

type EditableField = "purchaseDate" | "rate" | "unitPrice" | "quantity";

const editableFields: {
  field: EditableField;
  label: string;
  inputMode?: "decimal";
  /** Whether the value is a number whose thousands are grouped as the owner types. */
  grouped?: boolean;
  /** Wide enough for the longest value the column usually holds. */
  width: string;
}[] = [
  { field: "purchaseDate", label: "Data da compra", width: "w-28" },
  { field: "rate", label: "Taxa", inputMode: "decimal", width: "w-20" },
  {
    field: "unitPrice",
    label: "Preço unitário",
    inputMode: "decimal",
    grouped: true,
    width: "w-28",
  },
  { field: "quantity", label: "Quantidade", inputMode: "decimal", grouped: true, width: "w-20" },
];

interface ImportPreviewProps {
  rows: PreviewRow[];
  catalogue: BondQuote[];
  /** What the API rejected in each row, by the row's line in the file. */
  rejections: ReadonlyMap<number, string[]>;
  onChange: (index: number, row: PreviewRow) => void;
  onRemove: (index: number) => void;
}

/**
 * ImportPreview lists the rows of a lots file for the owner to edit or remove before importing
 * them. Every row has a bond picker; one whose name doesn't match a catalogue bond exactly is
 * highlighted, holds a suggestion, or nothing, and names what the file gives for the owner to
 * check it against.
 */
export function ImportPreview({
  rows,
  catalogue,
  rejections,
  onChange,
  onRemove,
}: ImportPreviewProps) {
  const noteIdPrefix = useId();
  return (
    <Table variant="grouped" aria-label="Compras do arquivo">
      <TableHeader>
        <TableRow variant="grouped">
          <TableHead scope="col" variant="grouped">
            Título
          </TableHead>
          {editableFields.map(({ field, label }) => (
            <TableHead key={field} scope="col" variant="grouped" align="end">
              {label}
            </TableHead>
          ))}
          <TableHead scope="col" variant="grouped">
            <span className="sr-only">Ações</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((preview, index) => {
          const { row, exact, bond } = preview;
          const noteId = `${noteIdPrefix}-${row.line}`;
          const flagged = !row.malformed && !exact;
          return (
            <TableRow key={row.line} variant={flagged ? "caution" : "grouped"}>
              <TableCell variant="grouped" colSpan={row.malformed ? 5 : 1}>
                {row.malformed ? (
                  <p className="text-destructive">{problemMessages.malformed}</p>
                ) : (
                  <div className="w-60">
                    <NativeSelect
                      variant={exact ? "text" : "default"}
                      className="w-full"
                      aria-label={`Título da linha ${row.line}`}
                      aria-describedby={flagged ? noteId : undefined}
                      value={bond ? bondKey(bond) : ""}
                      onChange={(event) =>
                        onChange(index, {
                          ...preview,
                          bond: catalogue.find((b) => bondKey(b) === event.target.value) ?? null,
                        })
                      }
                    >
                      <NativeSelectOption value="">Escolha um título</NativeSelectOption>
                      {catalogue.map((b) => (
                        <NativeSelectOption key={bondKey(b)} value={bondKey(b)}>
                          {bondLabel(b)}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    {flagged && (
                      <p
                        id={noteId}
                        className="mt-2 flex items-start gap-1.5 text-footnote text-caution"
                      >
                        <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                        {`“${row.bond.trim()}” não reconhecido. ${
                          bond ? "Confirme o título." : "Escolha o título."
                        }`}
                      </p>
                    )}
                    {rejections.get(row.line)?.map((message) => (
                      <p key={message} className="mt-2 text-footnote text-destructive">
                        {message}
                      </p>
                    ))}
                  </div>
                )}
              </TableCell>
              {!row.malformed &&
                editableFields.map(({ field, label, inputMode, grouped, width }) => (
                  <TableCell key={field} variant="grouped">
                    <div className={width}>
                      <InlineInput
                        className="w-full"
                        aria-label={`${label} da linha ${row.line}`}
                        inputMode={inputMode}
                        grouped={grouped}
                        value={row[field]}
                        onChange={(value) =>
                          onChange(index, { ...preview, row: { ...row, [field]: value } })
                        }
                      />
                    </div>
                  </TableCell>
                ))}
              <TableCell variant="grouped" align="end">
                <Button
                  type="button"
                  variant="plain"
                  size="icon-sm"
                  aria-label={`Remover linha ${row.line}`}
                  onClick={() => onRemove(index)}
                >
                  <Trash2Icon aria-hidden="true" strokeWidth={1.5} />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
