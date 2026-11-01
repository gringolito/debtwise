import { Trash2Icon } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BondQuote } from "@/lib/api";
import { bondLabel } from "@/lib/bondKinds";
import { type CsvRow, problemMessages } from "@/lib/lotsCsv";

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

const editableFields: { field: EditableField; label: string }[] = [
  { field: "purchaseDate", label: "Data da compra" },
  { field: "rate", label: "Taxa" },
  { field: "unitPrice", label: "Preço unitário" },
  { field: "quantity", label: "Quantidade" },
];

interface ImportPreviewProps {
  rows: PreviewRow[];
  catalogue: BondQuote[];
  onChange: (index: number, row: PreviewRow) => void;
  onRemove: (index: number) => void;
}

/**
 * ImportPreview lists the rows of a lots file for the owner to edit or remove before importing
 * them. Every row has a bond picker; one whose name doesn't match a catalogue bond exactly holds a
 * suggestion, or nothing, with the name the file gives for the owner to check it against.
 */
export function ImportPreview({ rows, catalogue, onChange, onRemove }: ImportPreviewProps) {
  const id = useId();
  const inexact = rows.filter((p) => !p.exact && !p.row.malformed).length;
  return (
    <>
      {inexact > 0 && (
        <p className="text-sm text-muted-foreground">
          {inexact === 1
            ? "1 linha não corresponde exatamente a um título do catálogo."
            : `${inexact} linhas não correspondem exatamente a um título do catálogo.`}{" "}
          Confira o título sugerido ou escolha outro.
        </p>
      )}
      <Table aria-label="Lotes do arquivo">
        <TableHeader>
          <TableRow>
            <TableHead>Linha</TableHead>
            <TableHead>Título</TableHead>
            <TableHead>Data da compra</TableHead>
            <TableHead>Taxa (% ao ano)</TableHead>
            <TableHead>Preço unitário</TableHead>
            <TableHead>Quantidade</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((preview, index) => {
            const { row, exact, bond } = preview;
            const fileNameId = `${id}-${row.line}`;
            return (
              <TableRow key={row.line}>
                <TableCell>{row.line}</TableCell>
                {row.malformed ? (
                  <TableCell colSpan={5}>
                    <span className="text-destructive">{problemMessages.malformed}</span>
                  </TableCell>
                ) : (
                  <>
                    <TableCell>
                      <NativeSelect
                        className="w-72"
                        aria-label={`Título da linha ${row.line}`}
                        aria-describedby={exact ? undefined : fileNameId}
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
                      {!exact && (
                        <p id={fileNameId} className="mt-1 text-xs text-muted-foreground">
                          No arquivo: {row.bond.trim()}
                        </p>
                      )}
                    </TableCell>
                    {editableFields.map(({ field, label }) => (
                      <TableCell key={field}>
                        <Input
                          aria-label={`${label} da linha ${row.line}`}
                          className="w-28"
                          inputMode={field === "purchaseDate" ? undefined : "decimal"}
                          value={row[field]}
                          onChange={(event) =>
                            onChange(index, {
                              ...preview,
                              row: { ...row, [field]: event.target.value },
                            })
                          }
                        />
                      </TableCell>
                    ))}
                  </>
                )}
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remover linha ${row.line}`}
                    onClick={() => onRemove(index)}
                  >
                    <Trash2Icon />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
}
