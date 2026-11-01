import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
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
import { type BondQuote, bondsKey, fetchBonds } from "@/lib/api";
import { useImportLots } from "@/lib/lotQueries";
import {
  bondLabel,
  type CsvRow,
  type ImportedRow,
  importErrors,
  importedRow,
  matchBond,
  problemMessages,
  readLotsCsv,
} from "@/lib/lotsCsv";

/** A row of the preview, with the catalogue bond the owner keeps for it, if any. */
interface PreviewRow {
  row: CsvRow;
  exact: boolean;
  bond: BondQuote | null;
}

/** bondKey tells the bonds of the catalogue apart as the value of an option. */
const bondKey = ({ type, maturity }: BondQuote) => `${type} ${maturity}`;

/**
 * ImportLots reads a lots file in the browser, previews its rows, lets the owner pick the bond of
 * each row whose name the catalogue lacks, suggesting the closest, and then records every lot of
 * the file, or none.
 */
export function ImportLots() {
  const fileId = useId();
  const catalogue = useQuery({ queryKey: bondsKey, queryFn: fetchBonds });
  const importLots = useImportLots();
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [imported, setImported] = useState<ImportedRow[]>([]);
  const bonds = catalogue.data?.bonds ?? [];
  const invalidRows = importErrors(importLots.error, imported);
  const inexact = preview?.filter((p) => !p.exact && !p.row.malformed).length ?? 0;

  async function read(file: File | undefined) {
    importLots.reset();
    setImported([]);
    if (!file) {
      setPreview(null);
      return;
    }
    const rows = readLotsCsv(await file.text());
    setPreview(rows.map((row) => ({ row, ...matchBond(row.bond, bonds) })));
  }

  function pick(index: number, key: string) {
    const bond = bonds.find((b) => bondKey(b) === key) ?? null;
    setPreview((rows) => rows?.map((p, i) => (i === index ? { ...p, bond } : p)) ?? null);
  }

  function submit() {
    if (!preview) return;
    const rows = preview.map((p) => importedRow(p.row, p.bond));
    setImported(rows);
    importLots.mutate(
      rows.map((r) => r.input),
      { onSuccess: () => setPreview(null) },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Importar lotes de um arquivo CSV</h2>
        <Button asChild variant="outline">
          <Link to="/lotes">Voltar aos lotes</Link>
        </Button>
      </div>
      {catalogue.isError && (
        <Alert variant="destructive">
          <AlertDescription>Não foi possível ler o catálogo de títulos.</AlertDescription>
        </Alert>
      )}
      <Field>
        <FieldLabel htmlFor={fileId}>Arquivo CSV</FieldLabel>
        <Input
          id={fileId}
          type="file"
          accept=".csv,text/csv"
          disabled={!catalogue.data || importLots.isPending}
          aria-describedby={`${fileId}-hint`}
          onChange={(event) => read(event.target.files?.[0])}
        />
        <FieldDescription id={`${fileId}-hint`}>
          Uma linha de cabeçalho e, em cada linha, Título (como no Tesouro Direto, por exemplo
          "Tesouro IPCA+ 2035"), Data da compra (dd/mm/aaaa), Taxa (% ao ano), Preço unitário e
          Quantidade, separados por ponto e vírgula ou vírgula. O arquivo é lido no navegador.
        </FieldDescription>
      </Field>
      {importLots.isSuccess && (
        <p role="status" className="text-sm">
          {importLots.data.length === 1
            ? "1 lote importado."
            : `${importLots.data.length} lotes importados.`}{" "}
          <Link to="/lotes">Ver lotes</Link>.
        </p>
      )}
      {importLots.isError && invalidRows.length === 0 && (
        <Alert variant="destructive">
          <AlertDescription>Não foi possível importar os lotes.</AlertDescription>
        </Alert>
      )}
      {invalidRows.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <p>Nenhum lote foi importado. Corrija estas linhas e importe o arquivo de novo:</p>
            <ul aria-label="Linhas inválidas" className="list-disc pl-5">
              {invalidRows.map(({ line, messages }) => (
                <li key={line}>{`Linha ${line}: ${messages.join(" ")}`}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {preview?.length === 0 && <p>O arquivo não tem lotes.</p>}
      {preview && preview.length > 0 && (
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
              {preview.map((p, index) => (
                <TableRow key={p.row.line}>
                  <TableCell>{p.row.line}</TableCell>
                  {p.row.malformed ? (
                    <TableCell colSpan={6} className="text-destructive">
                      {problemMessages.malformed}
                    </TableCell>
                  ) : (
                    <>
                      <TableCell>{p.row.bond.trim()}</TableCell>
                      <TableCell>
                        {p.exact && p.bond ? (
                          bondLabel(p.bond)
                        ) : (
                          <NativeSelect
                            aria-label={`Título da linha ${p.row.line}`}
                            value={p.bond ? bondKey(p.bond) : ""}
                            onChange={(event) => pick(index, event.target.value)}
                          >
                            <NativeSelectOption value="">Escolha um título</NativeSelectOption>
                            {bonds.map((b) => (
                              <NativeSelectOption key={bondKey(b)} value={bondKey(b)}>
                                {bondLabel(b)}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                        )}
                      </TableCell>
                      <TableCell>{p.row.purchaseDate.trim()}</TableCell>
                      <TableCell>{p.row.rate.trim()}</TableCell>
                      <TableCell>{p.row.unitPrice.trim()}</TableCell>
                      <TableCell>{p.row.quantity.trim()}</TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div>
            <Button type="button" onClick={submit} disabled={importLots.isPending}>
              {preview.length === 1 ? "Importar 1 lote" : `Importar ${preview.length} lotes`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
