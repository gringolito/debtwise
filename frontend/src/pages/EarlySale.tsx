import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { SelectField } from "@/components/mortgage/FormControls";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api";
import { useEarlySaleChecks } from "@/lib/earlySaleQueries";
import { effectOptions, type PrepaymentEffect } from "@/lib/mortgageEvents";
import { EarlySaleList } from "@/pages/earlysale/EarlySaleList";

export function EarlySale() {
  const [effect, setEffect] = useState<PrepaymentEffect>("shorten_term");
  const checks = useEarlySaleChecks(effect);
  const noMortgage = checks.error instanceof ApiError && checks.error.status === 404;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Venda antecipada</h2>
      <div className="max-w-xs">
        <SelectField label="Efeito" options={effectOptions} value={effect} onChange={setEffect} />
      </div>
      {checks.isPending && <p>Comparando os lotes…</p>}
      {noMortgage && (
        <Alert variant="warning">
          <AlertDescription>
            Nenhum financiamento cadastrado.{" "}
            <Link to="/financiamento/editar">Cadastrar financiamento</Link>.
          </AlertDescription>
        </Alert>
      )}
      {checks.isError && !noMortgage && (
        <Alert variant="destructive">
          <AlertDescription>Não foi possível comparar os lotes.</AlertDescription>
        </Alert>
      )}
      {checks.data && <EarlySaleList list={checks.data} />}
    </div>
  );
}
