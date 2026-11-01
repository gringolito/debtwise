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

/** PreviewRow is a row of a lots file with the catalogue bond the owner keeps for it, if any. */
export interface PreviewRow {
  row: CsvRow;
  /** Whether the file names the bond exactly, so there is nothing to pick. */
  exact: boolean;
  bond: BondQuote | null;
}

/** bondKey tells the bonds of the catalogue apart as the value of an option. */
const bondKey = ({ type, maturity }: BondQuote) => `${type} ${maturity}`;

interface ImportPreviewProps {
  rows: PreviewRow[];
  catalogue: BondQuote[];
  onPick: (index: number, bond: BondQuote | null) => void;
}

/**
 * ImportPreview lists the rows of a lots file as the file writes them, with a bond picker on every
 * row whose name doesn't match a catalogue bond exactly.
 */
export function ImportPreview({ rows, catalogue, onPick }: ImportPreviewProps) {
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
            <TableHead>No arquivo</TableHead>
            <TableHead>Título</TableHead>
            <TableHead>Data da compra</TableHead>
            <TableHead>Taxa</TableHead>
            <TableHead>Preço unitário</TableHead>
            <TableHead>Quantidade</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ row, exact, bond }, index) => (
            <TableRow key={row.line}>
              <TableCell>{row.line}</TableCell>
              {row.malformed ? (
                <TableCell colSpan={6}>
                  <span className="text-destructive">{problemMessages.malformed}</span>
                </TableCell>
              ) : (
                <>
                  <TableCell>{row.bond.trim()}</TableCell>
                  <TableCell>
                    {exact && bond ? (
                      bondLabel(bond)
                    ) : (
                      <NativeSelect
                        aria-label={`Título da linha ${row.line}`}
                        value={bond ? bondKey(bond) : ""}
                        onChange={(event) =>
                          onPick(
                            index,
                            catalogue.find((b) => bondKey(b) === event.target.value) ?? null,
                          )
                        }
                      >
                        <NativeSelectOption value="">Escolha um título</NativeSelectOption>
                        {catalogue.map((b) => (
                          <NativeSelectOption key={bondKey(b)} value={bondKey(b)}>
                            {bondLabel(b)}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    )}
                  </TableCell>
                  <TableCell>{row.purchaseDate.trim()}</TableCell>
                  <TableCell>{row.rate.trim()}</TableCell>
                  <TableCell>{row.unitPrice.trim()}</TableCell>
                  <TableCell>{row.quantity.trim()}</TableCell>
                </>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
