import { Link } from "@tanstack/react-router";
import { useId } from "react";
import investIllustration from "@/assets/answer-invest.webp";
import prepayIllustration from "@/assets/answer-prepay.webp";
import { Button } from "@/components/ui/button";
import type { Decision } from "@/lib/api";
import { bestVerdict } from "@/lib/dashboard";
import { type ComparedVerdict, favoured, noComparisons } from "@/lib/decisions";
import { formatDate, formatMoney } from "@/lib/format";
import { effectSearch } from "@/lib/investments";
import type { PrepaymentEffect } from "@/lib/mortgageEvents";
import { advantageAmount, advantageShare, horizon, verdictHeadline } from "@/lib/yardstick";
import { noComparisonExplanation } from "@/pages/decision/NoComparisonPanel";
import { StaleNote } from "@/pages/marketdata/StaleNote";

const illustrations = {
  invest: investIllustration,
  prepay: prepayIllustration,
};

const effectClauses: Record<PrepaymentEffect, string> = {
  shorten_term: "reduzindo o prazo",
  lower_installment: "reduzindo a prestação",
};

/** The yardstick line: how much the difference is worth against the amount, over the horizon. */
function Yardstick({ verdict }: { verdict: ComparedVerdict }) {
  const until = formatDate(verdict.maturity);
  if (favoured(verdict.advantage) === "even") return <>Nenhuma diferença até {until}.</>;
  const amount = <span className="font-semibold text-foreground">{advantageAmount(verdict)}</span>;
  return (
    <>
      {amount} {verdict.near_tie ? "de diferença" : "de diferença a favor"} até {until},{" "}
      {advantageShare(verdict)} do valor em {horizon(verdict)}.
    </>
  );
}

/**
 * Answer states, centered on the page's background, the best decision for the amount of a
 * decision, with a note under it when the market data that answer reads is not fresh. With no
 * verdict to state, it says why when the amount is too small to buy any bond, and otherwise
 * invites a comparison. A clear winner, not a near tie or an even one, gets its illustration on a
 * graphite glass icon above it.
 */
export function Answer({ decision }: { decision: Decision }) {
  const titleId = useId();
  const best = bestVerdict(decision.verdicts);
  const valor = Number(decision.amount);
  const side = best && favoured(best.advantage);
  const winner = side && side !== "even" && !best.near_tie ? side : undefined;
  const tooSmall = best
    ? undefined
    : noComparisons(decision).find((why) => why.reason === "amount_too_small");
  const explained = tooSmall && noComparisonExplanation(tooSmall);

  return (
    <div className="flex flex-col items-center gap-2 border-b pt-2 pb-10">
      <section aria-labelledby={titleId} className="flex flex-col items-center gap-3 text-center">
        {winner && (
          <div aria-hidden="true" className="mb-2 size-24 glass-primary glass-icon">
            <img src={illustrations[winner]} alt="" className="drop-shadow-glow" />
          </div>
        )}
        <p className="flex items-center gap-2 text-footnote text-muted-foreground">
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full bg-accent shadow-glow"
          />
          Na projeção atual, para {formatMoney(decision.amount)} hoje,{" "}
          {effectClauses[decision.effect]}
        </p>
        <h2 id={titleId} className="max-w-160 text-large-title font-semibold text-balance">
          {best
            ? verdictHeadline(best)
            : (explained?.title ?? "Amortizar ou investir? Veja a comparação.")}
        </h2>
        <p className="max-w-140 text-balance text-muted-foreground">
          {best ? (
            <Yardstick verdict={best} />
          ) : (
            (explained?.text ?? "Compare antes de registrar sua próxima amortização.")
          )}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Button asChild>
            <Link
              to="/comparar"
              search={{ valor, ...effectSearch(decision.effect), comparar: true }}
            >
              {best ? "Ver comparação" : "Comparar agora"}
            </Link>
          </Button>
          {best && (
            <Button variant="plain" asChild>
              <Link to="/comparar" search={{ valor, ...effectSearch(decision.effect) }}>
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
