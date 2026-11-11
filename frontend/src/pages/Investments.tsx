import { Link, useLocation } from "@tanstack/react-router";
import { TrendingUpIcon } from "lucide-react";
import { useState } from "react";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { Page, PageHeader, PageTitle } from "@/components/layout/Page";
import { type LotChange, LotFeedback } from "@/components/lots/LotFeedback";
import { LotSheet } from "@/components/lots/LotSheet";
import { ErrorPanel } from "@/components/patterns/ErrorPanel";
import { Button } from "@/components/ui/button";
import { useLots } from "@/lib/lotQueries";
import { InvestmentsSkeleton } from "@/pages/investments/InvestmentsSkeleton";

function Empty({ onAdd }: { onAdd: () => void }) {
  return (
    <section
      aria-label="Nenhuma compra"
      className="flex flex-col items-center gap-4 py-24 text-center"
    >
      <div className="flex size-14 items-center justify-center rounded-lg bg-accent-tint text-accent">
        <TrendingUpIcon aria-hidden="true" strokeWidth={1.5} className="size-7" />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-title-2">Nenhum título por aqui ainda</h2>
        <p className="max-w-110 text-callout text-muted-foreground">
          Registre suas compras do Tesouro Direto para comparar com amortizar o financiamento.
        </p>
      </div>
      <Button onClick={onAdd}>Adicionar compra</Button>
      <Button variant="link" size="inline" asChild>
        <Link to="/investimentos/importar">Importar planilha</Link>
      </Button>
    </section>
  );
}

function Content({ onAdd }: { onAdd: () => void }) {
  const lots = useLots();
  if (!lots.data) {
    if (lots.isError) {
      return (
        <ErrorPanel
          title="Não foi possível carregar seus investimentos"
          onRetry={() => void lots.refetch()}
        />
      );
    }
    return <InvestmentsSkeleton />;
  }
  if (lots.data.lots.length === 0) return <Empty onAdd={onAdd} />;
  return (
    <SectionLayout
      label="Investimentos"
      sections={[
        { to: "/investimentos", label: "Compras" },
        { to: "/investimentos/venda-antecipada", label: "Venda antecipada" },
      ]}
    />
  );
}

/**
 * Investments is Investimentos: the lots bought, under Compras, and whether selling each early is
 * worth it, under Venda antecipada. Compras records lots in a sheet or imports them.
 */
export function Investments() {
  const [adding, setAdding] = useState(false);
  const [feedback, setFeedback] = useState<LotChange | null>(null);
  const onPurchases = useLocation({
    select: (location) => location.pathname.replace(/\/+$/, "") === "/investimentos",
  });
  const { data } = useLots();
  const hasLots = (data?.lots.length ?? 0) > 0;

  return (
    <Page className="gap-6">
      <PageHeader className="items-center">
        <PageTitle>Investimentos</PageTitle>
        {onPurchases && hasLots && (
          <div className="flex items-center gap-6">
            <Button variant="link" size="inline" asChild>
              <Link to="/investimentos/importar">Importar planilha</Link>
            </Button>
            <Button onClick={() => setAdding(true)}>Adicionar compra</Button>
          </div>
        )}
      </PageHeader>
      <Content onAdd={() => setAdding(true)} />
      {adding && (
        <LotSheet
          onClose={() => setAdding(false)}
          onSaved={(change) => {
            setAdding(false);
            setFeedback(change);
          }}
        />
      )}
      {feedback && <LotFeedback change={feedback} onClose={() => setFeedback(null)} />}
    </Page>
  );
}
