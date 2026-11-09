import { getRouteApi, Link } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";
import { useState } from "react";
import { Page, PageHeader, PageTitle } from "@/components/layout/Page";
import { LotSheet } from "@/components/lots/LotSheet";
import { DeleteEventDialog } from "@/components/mortgage/DeleteEventDialog";
import { ErrorPanel } from "@/components/patterns/ErrorPanel";
import { Loading } from "@/components/patterns/Loading";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { LotValued } from "@/lib/api";
import { bondLabel, bondRate } from "@/lib/bondKinds";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { effectOf, effectSearch, projectionsOf } from "@/lib/investments";
import { useDeleteLot, useLots } from "@/lib/lotQueries";
import { projectedByText } from "@/lib/projectionMethods";
import { EarlySalePanel } from "@/pages/investments/EarlySalePanel";
import { Coupons, Deductions, KeyFigures } from "@/pages/investments/LotFigures";

const route = getRouteApi("/shell/investimentos/compras/$lotId");

function BackLink() {
  return (
    <Button variant="link" size="inline" asChild className="self-start">
      <Link to="/investimentos">
        <ChevronLeftIcon aria-hidden="true" strokeWidth={1.5} />
        Investimentos
      </Link>
    </Button>
  );
}

function purchaseText(lot: LotValued): string {
  const quantity = formatNumber(lot.quantity);
  const bonds = quantity === "1" ? "1 título" : `${quantity} títulos`;
  return `Compra em ${formatDate(lot.purchase_date)} · ${bonds} a ${formatMoney(lot.unit_price)} · ${bondRate(lot.type, lot.rate)}`;
}

function ValuesNote({ lot }: { lot: LotValued }) {
  if (!lot.values) return null;
  const projections = projectionsOf(lot);
  return (
    <p className="text-center text-footnote text-muted-foreground">
      Valores de {formatDate(lot.values.on)}
      {projections.length > 0 && `, com projeção — ${projectedByText(projections)}`}.
    </p>
  );
}

function Detail({ lot }: { lot: LotValued }) {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const remove = useDeleteLot();
  const [editing, setEditing] = useState(false);
  const label = bondLabel(lot);

  return (
    <>
      <PageHeader className="flex-col items-stretch gap-1">
        <div className="flex items-baseline justify-between gap-4">
          <PageTitle>{label}</PageTitle>
          <div className="flex items-center gap-6">
            <Button variant="link" size="inline" onClick={() => setEditing(true)}>
              Editar
            </Button>
            <DeleteEventDialog
              variant="plain-destructive"
              size="inline"
              title="Excluir esta compra?"
              description={`A compra de ${label} em ${formatDate(lot.purchase_date)} será removida.`}
              onConfirm={() =>
                remove.mutate(lot.id, { onSuccess: () => void navigate({ to: "/investimentos" }) })
              }
            />
          </div>
        </div>
        <p className="text-callout text-muted-foreground">{purchaseText(lot)}</p>
      </PageHeader>
      {remove.isError && (
        <Alert variant="destructive">
          <AlertDescription>Não foi possível excluir a compra.</AlertDescription>
        </Alert>
      )}
      {lot.values ? (
        <KeyFigures lot={lot} values={lot.values} />
      ) : (
        <p className="rounded-lg glass p-6 text-body">
          Os valores desta compra dependem de um número-índice do IPCA que ainda não foi divulgado
          nem pode ser projetado.
        </p>
      )}
      <EarlySalePanel
        lot={lot}
        effect={effectOf(search)}
        onEffectChange={(effect) => navigate({ search: effectSearch(effect), replace: true })}
      />
      {lot.values && <Deductions values={lot.values} />}
      {lot.values && (lot.type === "ntn_f" || lot.type === "ntn_b") && (
        <Coupons coupons={lot.values.coupons} />
      )}
      <ValuesNote lot={lot} />
      {editing && <LotSheet lot={lot} onClose={() => setEditing(false)} />}
    </>
  );
}

function DetailSkeleton() {
  return (
    <Loading label="Carregando a compra">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-5 w-96" />
      </div>
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-44 w-full" />
    </Loading>
  );
}

/** LotDetail is one lot: its values, their deductions, its coupons and its early sale check. */
export function LotDetail() {
  const { lotId } = route.useParams();
  const lots = useLots();
  // Deleting the lot refetches the list before leaving the page, which goes on showing it.
  const [shown, setShown] = useState<LotValued>();
  const found = lots.data?.lots.find((l) => String(l.id) === lotId);
  if (found && found !== shown) setShown(found);
  const lot = found ?? shown;

  return (
    <Page className="gap-6">
      <BackLink />
      {lot ? (
        <Detail lot={lot} />
      ) : lots.isError ? (
        <ErrorPanel
          title="Não foi possível carregar a compra"
          onRetry={() => void lots.refetch()}
        />
      ) : !lots.isSuccess ? (
        <DetailSkeleton />
      ) : (
        <section className="flex flex-col items-center gap-2 rounded-lg glass p-12 text-center">
          <h1 className="text-headline">Esta compra não existe</h1>
          <p className="text-callout text-muted-foreground">Ela pode ter sido excluída.</p>
        </section>
      )}
    </Page>
  );
}
