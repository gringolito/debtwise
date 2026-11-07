import { Link } from "@tanstack/react-router";
import { ClockIcon } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import type { Decision, Verdict, VerdictMarketData } from "@/lib/api";
import { bestVerdict, staleSources } from "@/lib/dashboard";
import { isZero, verdictTitle } from "@/lib/decisions";
import { formatDate, formatInstantDayMonth, formatMoney } from "@/lib/format";
import { useMarketData } from "@/pages/marketdata/useMarketData";

function answer(best: Verdict & { advantage: string }): { title: string; detail: React.ReactNode } {
  const bond = verdictTitle(best);
  const horizon = formatDate(best.maturity);
  const amount = (
    <span className="font-semibold text-graphite-foreground">
      {formatMoney(best.advantage.replace("-", ""))}
    </span>
  );
  if (isZero(best.advantage)) {
    return {
      title: `Investir em ${bond} ou amortizar dá no mesmo`,
      detail: `Nenhuma diferença até ${horizon}.`,
    };
  }
  if (best.advantage.startsWith("-")) {
    return {
      title: "Amortizar rende mais",
      detail: (
        <>
          {amount} a mais do que investir em {bond}, até {horizon}.
        </>
      ),
    };
  }
  return {
    title: `Investir em ${bond} rende mais`,
    detail: (
      <>
        {amount} a mais do que amortizar, até {horizon}.
      </>
    ),
  };
}

function StaleNote({ marketData }: { marketData: VerdictMarketData }) {
  const { refresh, refreshing } = useMarketData();
  const sources = staleSources(marketData);
  if (sources.length === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 px-1 text-footnote text-caution">
      <ClockIcon aria-hidden="true" strokeWidth={1.5} className="size-4" />
      <span>
        {sources
          .map(({ name, refreshedAt }) =>
            refreshedAt
              ? `${name} de ${formatInstantDayMonth(refreshedAt)}.`
              : `${name} indisponível.`,
          )
          .join(" ")}
      </span>{" "}
      {refreshing || refresh.isPending ? (
        <span>Atualizando…</span>
      ) : (
        <button
          type="button"
          className="font-medium underline underline-offset-2"
          onClick={() => refresh.mutate()}
        >
          Atualizar
        </button>
      )}
    </p>
  );
}

/**
 * AnswerCard states the best decision for the amount of a decision, with a note under it when the
 * market data that answer reads is not fresh. With no verdict to state, it invites a comparison.
 */
export function AnswerCard({ decision }: { decision: Decision }) {
  const titleId = useId();
  const best = bestVerdict(decision.verdicts);
  const valor = Number(decision.amount);
  const stated =
    best?.advantage === undefined ? undefined : answer({ ...best, advantage: best.advantage });

  return (
    <div className="flex flex-col gap-2">
      <section
        aria-labelledby={titleId}
        className="flex flex-col gap-2 rounded-lg bg-graphite p-6 text-graphite-foreground"
      >
        <p className="text-footnote tracking-wide text-graphite-muted-foreground uppercase">
          Na projeção atual, para {formatMoney(decision.amount)} hoje
        </p>
        <h2 id={titleId} className="text-title-2">
          {stated?.title ?? "Amortizar ou investir? Veja a comparação."}
        </h2>
        <p className="text-callout text-graphite-muted-foreground">
          {stated?.detail ?? "Compare antes de registrar sua próxima amortização."}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <Button variant="inverse" asChild>
            <Link to="/decidir" search={{ valor, comparar: true }}>
              {stated ? "Ver comparação" : "Comparar agora"}
            </Link>
          </Button>
          {stated && (
            <Button variant="plain-inverse" asChild>
              <Link to="/decidir" search={{ valor }}>
                Mudar valor
              </Link>
            </Button>
          )}
        </div>
      </section>
      {best && <StaleNote marketData={best.market_data} />}
    </div>
  );
}
