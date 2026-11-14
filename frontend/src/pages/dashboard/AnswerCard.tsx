import { Link } from "@tanstack/react-router";
import { useId } from "react";
import investIllustration from "@/assets/answer-invest.webp";
import prepayIllustration from "@/assets/answer-prepay.webp";
import { Button } from "@/components/ui/button";
import type { Decision } from "@/lib/api";
import { bestVerdict } from "@/lib/dashboard";
import { type ComparedVerdict, favoured } from "@/lib/decisions";
import { formatDate, formatMoney } from "@/lib/format";
import { advantageAmount, advantageShare, horizon, verdictHeadline } from "@/lib/yardstick";
import { StaleNote } from "@/pages/marketdata/StaleNote";

const illustrations = {
  invest: investIllustration,
  prepay: prepayIllustration,
};

/** The yardstick line: how much the difference is worth against the amount, over the horizon. */
function Yardstick({ verdict }: { verdict: ComparedVerdict }) {
  const until = formatDate(verdict.maturity);
  if (favoured(verdict.advantage) === "even") return <>Nenhuma diferença até {until}.</>;
  return (
    <>
      <span className="font-semibold text-primary-foreground">{advantageAmount(verdict)}</span>
      {verdict.near_tie ? " de diferença" : " a mais"} até {until}, {advantageShare(verdict)} do
      valor em {horizon(verdict)}.
    </>
  );
}

/**
 * AnswerCard states the best decision for the amount of a decision, with a note under it when the
 * market data that answer reads is not fresh. With no verdict to state, it invites a comparison.
 * A clear winner, not a near tie or an even one, gets its illustration.
 */
export function AnswerCard({ decision }: { decision: Decision }) {
  const titleId = useId();
  const best = bestVerdict(decision.verdicts);
  const valor = Number(decision.amount);
  const side = best && favoured(best.advantage);
  const winner = side && side !== "even" && !best.near_tie ? side : undefined;

  return (
    <div className="flex flex-col gap-2">
      <section
        aria-labelledby={titleId}
        className="rounded-lg glass-primary p-6 text-primary-foreground sm:p-8"
      >
        <div className="flex items-center justify-between gap-8">
          <div className="flex min-w-0 max-w-120 flex-col gap-2">
            <p className="flex items-center gap-2 text-footnote text-primary-muted-foreground">
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full bg-accent-soft shadow-glow"
              />
              Na projeção atual, para {formatMoney(decision.amount)} hoje
            </p>
            <h2 id={titleId} className="text-title-2">
              {best ? verdictHeadline(best) : "Amortizar ou investir? Veja a comparação."}
            </h2>
            <p className="text-callout text-primary-muted-foreground">
              {best ? (
                <Yardstick verdict={best} />
              ) : (
                "Compare antes de registrar sua próxima amortização."
              )}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="inverse" asChild>
                <Link to="/comparar" search={{ valor, comparar: true }}>
                  {best ? "Ver comparação" : "Comparar agora"}
                </Link>
              </Button>
              {best && (
                <Button variant="plain-inverse" asChild>
                  <Link to="/comparar" search={{ valor }}>
                    Mudar valor
                  </Link>
                </Button>
              )}
            </div>
          </div>
          {winner && (
            <img
              src={illustrations[winner]}
              alt=""
              aria-hidden="true"
              className="hidden size-40 shrink-0 object-contain drop-shadow-glow sm:block"
            />
          )}
        </div>
      </section>
      {best && <StaleNote marketData={best.market_data} />}
    </div>
  );
}
