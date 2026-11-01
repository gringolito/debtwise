import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useRef, useState } from "react";
import { ImportPreview, type PreviewRow } from "@/components/lots/ImportPreview";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { bondsKey, fetchBonds } from "@/lib/api";
import { matchBond } from "@/lib/bondMatch";
import { useImportLots } from "@/lib/lotQueries";
import { type ImportedRow, importErrors, importedRow, readLotsCsv } from "@/lib/lotsCsv";

/**
 * ImportLots reads a lots file in the browser and previews its rows for the owner to edit, remove,
 * and pick the bond of each row whose name the catalogue lacks, then records every lot left, or
 * none.
 */
export function ImportLots() {
  const fileId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const lastFile = useRef<File | null>(null);
  const catalogue = useQuery({ queryKey: bondsKey, queryFn: fetchBonds });
  const importLots = useImportLots();
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [imported, setImported] = useState<ImportedRow[]>([]);
  // Lines edited or removed since the last import; the API's rejection no longer speaks for them.
  const [revised, setRevised] = useState<ReadonlySet<number>>(new Set());
  const bonds = catalogue.data?.bonds ?? [];
  const rejectedRows = importErrors(importLots.error, imported);
  const invalidRows = rejectedRows.filter(({ line }) => !revised.has(line));

  async function read(file: File | null) {
    lastFile.current = file;
    importLots.reset();
    setImported([]);
    setRevised(new Set());
    setPreview(null);
    if (!file) return;
    const rows = readLotsCsv(await file.text());
    // A file picked while this one was being read replaces it.
    if (lastFile.current !== file) return;
    setPreview(
      rows.map((row) => {
        const match = matchBond(row.bond, bonds);
        return "exact" in match
          ? { row, exact: true, bond: match.exact }
          : { row, exact: false, bond: match.suggested };
      }),
    );
  }

  function revise(line: number) {
    setRevised((lines) => new Set(lines).add(line));
  }

  function change(index: number, row: PreviewRow) {
    revise(row.row.line);
    setPreview((rows) => rows?.map((p, i) => (i === index ? row : p)) ?? null);
  }

  function remove(index: number) {
    const line = preview?.[index]?.row.line;
    if (line !== undefined) revise(line);
    setPreview((rows) => rows?.filter((_, i) => i !== index) ?? null);
  }

  function submit() {
    if (!preview) return;
    const rows = preview.map((p) => importedRow(p.row, p.bond));
    setImported(rows);
    setRevised(new Set());
    importLots.mutate(
      rows.map((r) => r.input),
      {
        onSuccess: () => {
          setPreview(null);
          if (fileInput.current) fileInput.current.value = "";
        },
      },
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
          ref={fileInput}
          id={fileId}
          type="file"
          accept=".csv,text/csv"
          disabled={!catalogue.data || importLots.isPending}
          aria-describedby={`${fileId}-hint`}
          // Cleared on each click so picking the same file again, edited, still reads it.
          onClick={(event) => {
            event.currentTarget.value = "";
          }}
          onChange={(event) => read(event.target.files?.[0] ?? null)}
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
      {importLots.isError && rejectedRows.length === 0 && (
        <Alert variant="destructive">
          <AlertDescription>Não foi possível importar os lotes.</AlertDescription>
        </Alert>
      )}
      {invalidRows.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <p>
              Nenhum lote foi importado. Corrija ou remova estas linhas abaixo e importe de novo:
            </p>
            <ul aria-label="Linhas inválidas" className="list-disc pl-5">
              {invalidRows.map(({ line, messages }) => (
                <li key={line}>{`Linha ${line}: ${messages.join(" ")}`}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {preview?.length === 0 && <p>Nenhum lote para importar.</p>}
      {preview && preview.length > 0 && (
        <>
          <ImportPreview rows={preview} catalogue={bonds} onChange={change} onRemove={remove} />
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
