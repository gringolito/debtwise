import { Link } from "@tanstack/react-router";
import { TrendingUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LotList } from "@/lib/api";
import { bondCount } from "@/lib/dashboard";
import { useEarlySaleChecks } from "@/lib/earlySaleQueries";
import { formatMoney } from "@/lib/format";
import {
  SummaryBody,
  SummaryFigure,
  SummaryLink,
  SummaryPanel,
} from "@/pages/dashboard/SummaryPanel";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function EarlySaleSummary() {
  const { data } = useEarlySaleChecks("shorten_term");
  if (!data) return "Venda antecipada";
  const worth = data.checks.filter((check) => check.verdict === "sell").length;
  if (worth === 0) return "Venda antecipada · Nenhuma vale a pena agora";
  return `Venda antecipada · ${worth === 1 ? "1 vale" : `${worth} valem`} a pena agora`;
}

function Empty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-lg bg-accent-tint text-accent">
        <TrendingUpIcon aria-hidden="true" strokeWidth={1.5} className="size-6" />
      </div>
      <p className="max-w-70 text-callout text-muted-foreground">
        Registre suas compras do Tesouro para acompanhar o valor e a venda antecipada.
      </p>
      <Button variant="link" size="inline" asChild>
        <Link to="/investimentos">Adicionar compra</Link>
      </Button>
    </div>
  );
}

/** InvestmentsPanel is what the lots would fetch if sold today, and whether selling any is worth it. */
export function InvestmentsPanel({
  lots: { lots, market_value },
  today,
}: {
  lots: LotList;
  today: string;
}) {
  if (lots.length === 0) {
    return (
      <SummaryPanel title="Investimentos">
        <Empty />
      </SummaryPanel>
    );
  }

  const leftOut = lots.filter((lot) => !lot.values?.market && lot.maturity > today).length;
  return (
    <SummaryPanel title="Investimentos">
      <SummaryBody>
        {market_value ? (
          <SummaryFigure label="Valor de mercado líquido" figure={formatMoney(market_value.net)} />
        ) : (
          <p className="text-callout text-muted-foreground">
            Nenhuma compra tem valor de mercado hoje.
          </p>
        )}
        <p className="text-callout text-muted-foreground">
          {plural(lots.length, "compra", "compras")} ·{" "}
          {plural(bondCount(lots), "título", "títulos")}
        </p>
        {market_value && leftOut > 0 && (
          <p className="mt-2 text-footnote text-muted-foreground">
            {leftOut === 1
              ? "1 compra sem valor de mercado ficou fora do total."
              : `${leftOut} compras sem valor de mercado ficaram fora do total.`}
          </p>
        )}
      </SummaryBody>
      <SummaryLink to="/investimentos/venda-antecipada">
        <EarlySaleSummary />
      </SummaryLink>
    </SummaryPanel>
  );
}
