import { Link } from "@tanstack/react-router";
import { useId } from "react";
import investIllustration from "@/assets/answer-invest.webp";
import prepayIllustration from "@/assets/answer-prepay.webp";
import { Button } from "@/components/ui/button";
import type { Decision, Verdict } from "@/lib/api";
import { bestVerdict } from "@/lib/dashboard";
import { isZero, verdictTitle } from "@/lib/decisions";
import { formatDate, formatMoney } from "@/lib/format";
import { StaleNote } from "@/pages/marketdata/StaleNote";

type Winner = "invest" | "prepay";

const illustrations: Record<Winner, string> = {
  invest: investIllustration,
  prepay: prepayIllustration,
};

function answer(best: Verdict & { advantage: string }): {
  title: string;
  detail: React.ReactNode;
  winner?: Winner;
} {
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
      winner: "prepay",
    };
  }
  return {
    title: `Investir em ${bond} rende mais`,
    detail: (
      <>
        {amount} a mais do que amortizar, até {horizon}.
      </>
    ),
    winner: "invest",
  };
}

function Illustration({ winner }: { winner: Winner }) {
  return (
    <div aria-hidden="true" className="relative hidden shrink-0 md:block">
      <span className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-accent-soft px-3 py-0.5 text-footnote font-semibold whitespace-nowrap text-graphite shadow-glow">
        Melhor opção
      </span>
      <img src={illustrations[winner]} alt="" className="size-40 object-contain drop-shadow-glow" />
    </div>
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
        className="rounded-lg glass-graphite p-8 text-graphite-foreground"
      >
        <div className="flex items-center justify-between gap-8">
          <div className="flex max-w-120 flex-col gap-2">
            <p className="flex items-center gap-2 text-footnote tracking-wide text-graphite-muted-foreground uppercase">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-accent-soft shadow-glow"
              />
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
                <Link to="/comparar" search={{ valor, comparar: true }}>
                  {stated ? "Ver comparação" : "Comparar agora"}
                </Link>
              </Button>
              {stated && (
                <Button variant="plain-inverse" asChild>
                  <Link to="/comparar" search={{ valor }}>
                    Mudar valor
                  </Link>
                </Button>
              )}
            </div>
          </div>
          {stated?.winner && <Illustration winner={stated.winner} />}
        </div>
      </section>
      {best && <StaleNote marketData={best.market_data} />}
    </div>
  );
}
