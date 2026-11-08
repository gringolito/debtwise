import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeftIcon, FileTextIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Page, PageHeader, PageTitle } from "@/components/layout/Page";
import { ImportPreview, type PreviewRow } from "@/components/lots/ImportPreview";
import { ErrorPanel } from "@/components/patterns/ErrorPanel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError, bondsKey, fetchBonds } from "@/lib/api";
import { matchBond } from "@/lib/bondMatch";
import { groupThousands } from "@/lib/format";
import { useImportLots } from "@/lib/lotQueries";
import { type ImportedRow, importErrors, importedRow, readLotsCsv } from "@/lib/lotsCsv";

/** ReadFile is a lots file the owner picked: its name and how many rows it held. */
interface ReadFile {
  name: string;
  rows: number;
}

/**
 * ImportLots reads a lots file in the browser and previews its rows for the owner to edit, remove,
 * and pick the bond of each row whose name the catalogue lacks, then records every purchase left,
 * or none.
 */
export function ImportLots() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const lastFile = useRef<File | null>(null);
  const catalogue = useQuery({ queryKey: bondsKey, queryFn: fetchBonds });
  const importLots = useImportLots();
  const [file, setFile] = useState<ReadFile | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [imported, setImported] = useState<ImportedRow[]>([]);
  // Lines edited or removed since the last import; the API's rejection no longer speaks for them.
  const [revised, setRevised] = useState<ReadonlySet<number>>(new Set());
  const bonds = catalogue.data?.bonds ?? [];
  const rejected = importLots.error instanceof ApiError && importLots.error.status === 422;
  const rejectedRows = importErrors(importLots.error, imported);
  const invalidRows = rejectedRows.filter(({ line }) => !revised.has(line));
  const rejections = new Map(invalidRows.map(({ line, messages }) => [line, messages]));

  async function read(picked: File | null) {
    lastFile.current = picked;
    if (!picked) return;
    const rows = readLotsCsv(await picked.text());
    // A file picked while this one was being read replaces it.
    if (lastFile.current !== picked) return;
    importLots.reset();
    setImported([]);
    setRevised(new Set());
    setFile({ name: picked.name, rows: rows.length });
    setPreview(
      rows.map((read) => {
        const row = {
          ...read,
          unitPrice: groupThousands(read.unitPrice),
          quantity: groupThousands(read.quantity),
        };
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
    setPreview((rows) => rows.map((p, i) => (i === index ? row : p)));
  }

  function remove(index: number) {
    const line = preview[index]?.row.line;
    if (line !== undefined) revise(line);
    setPreview((rows) => rows.filter((_, i) => i !== index));
  }

  function submit() {
    const rows = preview.map((p) => importedRow(p.row, p.bond));
    setImported(rows);
    setRevised(new Set());
    importLots.mutate(
      rows.map((r) => r.input),
      { onSuccess: () => void navigate({ to: "/investimentos" }) },
    );
  }

  return (
    <Page>
      <div className="flex flex-col gap-3">
        <Button variant="link" size="inline" asChild className="self-start">
          <Link to="/investimentos">
            <ChevronLeftIcon aria-hidden="true" strokeWidth={1.5} />
            Investimentos
          </Link>
        </Button>
        <PageHeader>
          <PageTitle>Importar planilha</PageTitle>
        </PageHeader>
        <p className="text-callout text-muted-foreground">
          Revise antes de importar. Você pode corrigir qualquer linha.
        </p>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv"
        aria-label="Planilha"
        className="hidden"
        disabled={!catalogue.data || importLots.isPending}
        // Cleared on each click so picking the same file again, edited, still reads it.
        onClick={(event) => {
          event.currentTarget.value = "";
        }}
        onChange={(event) => void read(event.target.files?.[0] ?? null)}
      />
      {catalogue.isError ? (
        <ErrorPanel
          title="Não foi possível carregar os títulos"
          onRetry={() => void catalogue.refetch()}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {importLots.isError && !rejected && (
            <Alert variant="destructive">
              <AlertDescription>Não foi possível importar as compras.</AlertDescription>
            </Alert>
          )}
          {rejected && (rejectedRows.length === 0 || invalidRows.length > 0) && (
            <Alert variant="destructive">
              <AlertDescription>
                Nenhuma compra foi importada. Corrija as linhas destacadas e importe de novo.
              </AlertDescription>
            </Alert>
          )}
          {file ? (
            <>
              <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
                <FileTextIcon
                  aria-hidden="true"
                  strokeWidth={1.5}
                  className="size-5 text-muted-foreground"
                />
                <span className="text-callout font-medium">{file.name}</span>
                <span className="text-callout text-muted-foreground">
                  · {file.rows === 1 ? "1 linha" : `${file.rows} linhas`}
                </span>
                <Button
                  type="button"
                  variant="link"
                  size="inline"
                  className="ml-auto"
                  disabled={importLots.isPending}
                  onClick={() => fileInput.current?.click()}
                >
                  Trocar arquivo
                </Button>
              </div>
              {preview.length === 0 ? (
                <p className="rounded-lg border bg-card p-6 text-callout text-muted-foreground">
                  Nenhuma compra para importar.
                </p>
              ) : (
                <ImportPreview
                  rows={preview}
                  catalogue={bonds}
                  rejections={rejections}
                  onChange={change}
                  onRemove={remove}
                />
              )}
            </>
          ) : (
            <div className="flex flex-col items-start gap-6 rounded-lg border bg-card p-6">
              <p className="text-callout text-muted-foreground">
                Use um arquivo CSV com uma linha de cabeçalho e, em cada linha, Título (como no
                Tesouro Direto, por exemplo “Tesouro IPCA+ 2035”), Data da compra (dd/mm/aaaa), Taxa
                (% ao ano), Preço unitário e Quantidade, separados por ponto e vírgula ou vírgula. O
                arquivo é lido no navegador.
              </p>
              <Button
                type="button"
                disabled={!catalogue.data}
                onClick={() => fileInput.current?.click()}
              >
                Escolher arquivo
              </Button>
            </div>
          )}
          <div className="flex items-center justify-end gap-6">
            <Button variant="plain" asChild>
              <Link to="/investimentos">Cancelar</Link>
            </Button>
            {preview.length > 0 && (
              <Button type="button" onClick={submit} disabled={importLots.isPending}>
                {preview.length === 1 ? "Importar 1 compra" : `Importar ${preview.length} compras`}
              </Button>
            )}
          </div>
        </div>
      )}
    </Page>
  );
}
