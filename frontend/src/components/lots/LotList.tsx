import { useState } from "react";
import { EditLotForm } from "@/components/lots/LotForms";
import { CouponsTable, LotAmountsTable } from "@/components/lots/LotValuesTables";
import { DeleteEventDialog } from "@/components/mortgage/DeleteEventDialog";
import { Section } from "@/components/mortgage/Section";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { LotValued } from "@/lib/api";
import { bondRate } from "@/lib/bondKinds";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { lotLabel } from "@/lib/lots";
import { useDeleteLot, useLots } from "@/lib/lotQueries";

function LotValuesSection({ lot, label }: { lot: LotValued; label: string }) {
  if (lot.values_unavailable === "missing_ipca") {
    return (
      <Alert variant="warning">
        <AlertDescription>
          Os valores deste lote dependem de um número-índice do IPCA que ainda não foi divulgado nem
          pode ser projetado.
        </AlertDescription>
      </Alert>
    );
  }
  if (!lot.values) return null;
  const hasCoupons = lot.type === "ntn_f" || lot.type === "ntn_b";
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">Valores em {formatDate(lot.values.on)}</p>
      <LotAmountsTable label={label} values={lot.values} />
      {hasCoupons && <CouponsTable label={label} coupons={lot.values.coupons} />}
    </div>
  );
}

function LotCard({ lot, onDelete }: { lot: LotValued; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const label = lotLabel(lot);

  return (
    <Section heading={label}>
      {editing ? (
        <EditLotForm lot={lot} onClose={() => setEditing(false)} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <p>
              Vencimento {formatDate(lot.maturity)} · Taxa {bondRate(lot.type, lot.rate)} · Preço{" "}
              {formatMoney(lot.unit_price)} · Quantidade {formatNumber(lot.quantity)}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                aria-label={`Editar ${label}`}
                onClick={() => setEditing(true)}
              >
                Editar
              </Button>
              <DeleteEventDialog
                aria-label={`Excluir ${label}`}
                title="Excluir lote?"
                description={`O lote ${label} será removido.`}
                onConfirm={onDelete}
              />
            </div>
          </div>
          <LotValuesSection lot={lot} label={label} />
        </div>
      )}
    </Section>
  );
}

export function LotList() {
  const { data, isPending, isError } = useLots();
  const remove = useDeleteLot();

  if (isPending) return <p>Carregando lotes…</p>;
  if (isError) return <p>Não foi possível carregar os lotes.</p>;
  if (data.lots.length === 0) return <p>Nenhum lote registrado.</p>;
  return (
    <>
      {remove.isError && (
        <Alert variant="destructive">
          <AlertDescription>Não foi possível excluir o lote.</AlertDescription>
        </Alert>
      )}
      {data.lots.map((lot) => (
        <LotCard key={lot.id} lot={lot} onDelete={() => remove.mutate(lot.id)} />
      ))}
    </>
  );
}
