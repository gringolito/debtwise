import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { EventForm } from "@/components/mortgage/EventForm";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { bondsKey, fetchBonds } from "@/lib/api";
import { useImportLots } from "@/lib/lotQueries";
import { type CsvLot, importErrors, readLotsCsv } from "@/lib/lotsCsv";

/** ImportLotsForm reads a lots file in the browser and records every lot in it, or none. */
export function ImportLotsForm() {
  const id = useId();
  const catalogue = useQuery({ queryKey: bondsKey, queryFn: fetchBonds });
  const importLots = useImportLots();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<CsvLot[]>([]);
  const [empty, setEmpty] = useState(false);
  const invalidRows = importErrors(importLots.error, rows);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!file || !catalogue.data) return;
    const read = readLotsCsv(await file.text(), catalogue.data.bonds);
    setRows(read);
    setEmpty(read.length === 0);
    importLots.reset();
    if (read.length === 0) return;
    importLots.mutate(
      read.map((row) => row.input),
      {
        onSuccess: () => {
          form.reset();
          setFile(null);
        },
      },
    );
  }

  return (
    <EventForm aria-label="Importar lotes" failure={failure()} onSubmit={submit}>
      <Field>
        <FieldLabel htmlFor={id}>Arquivo CSV</FieldLabel>
        <Input
          id={id}
          type="file"
          accept=".csv,text/csv"
          aria-describedby={`${id}-hint`}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <FieldDescription id={`${id}-hint`}>
          Uma linha de cabeçalho e, em cada linha, Título (como no Tesouro Direto, por exemplo
          "Tesouro IPCA+ 2035"), Data da compra (dd/mm/aaaa), Taxa (% ao ano), Preço unitário e
          Quantidade, separados por ponto e vírgula ou vírgula. O arquivo é lido no navegador.
        </FieldDescription>
      </Field>
      <Button type="submit" disabled={!file || !catalogue.data || importLots.isPending}>
        Importar
      </Button>
      {importLots.isSuccess && (
        <p role="status" className="basis-full text-sm">
          {importLots.data.length === 1
            ? "1 lote importado."
            : `${importLots.data.length} lotes importados.`}
        </p>
      )}
      {invalidRows.length > 0 && (
        <Alert variant="destructive" className="basis-full">
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
    </EventForm>
  );

  function failure(): string | null {
    if (catalogue.isError) return "Não foi possível ler o catálogo de títulos.";
    if (empty) return "O arquivo não tem lotes.";
    if (importLots.isError && invalidRows.length === 0)
      return "Não foi possível importar os lotes.";
    return null;
  }
}
