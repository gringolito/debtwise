// PROTOTYPE, throwaway: Início's answer card in "Orvalho nítido". The difference carries its
// yardstick, and a near-tie reads as one: no "Melhor opção" pill or winner illustration.
import { Link } from "@tanstack/react-router";
import { useId } from "react";
import investIllustration from "@/assets/answer-invest.webp";
import prepayIllustration from "@/assets/answer-prepay.webp";
import { Button } from "@/components/ui/button";
import type { Decision } from "@/lib/api";
import { bestVerdict } from "@/lib/dashboard";
import { verdictTitle } from "@/lib/decisions";
import { formatDate, formatMoney } from "@/lib/format";
import { StaleNote } from "@/pages/marketdata/StaleNote";
import { headline, yardstick } from "@/prototypes/verdictYardstick";

export function ProtoAnswerCard({ decision }: { decision: Decision }) {
  const titleId = useId();
  const best = bestVerdict(decision.verdicts);
  const valor = Number(decision.amount);
  const y =
    best?.advantage === undefined
      ? undefined
      : yardstick(decision, { ...best, advantage: best.advantage });
  const clearWinner = y && !y.nearTie && y.leader !== "tie" ? y.leader : undefined;

  return (
    <div className="flex flex-col gap-2">
      <section
        aria-labelledby={titleId}
        className="rounded-lg glass-graphite p-8 text-graphite-foreground"
      >
        <div className="proto-answer flex items-center justify-between gap-8">
          <div className="flex max-w-120 flex-col gap-2">
            <p className="flex items-center gap-2 text-footnote text-graphite-muted-foreground">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-[#82c7b7] shadow-glow" />
              Na projeção atual, para {formatMoney(decision.amount)} hoje
            </p>
            <h2 id={titleId} className="text-title-2">
              {best && y
                ? headline(y, verdictTitle(best))
                : "Amortizar ou investir? Veja a comparação."}
            </h2>
            <p className="text-callout text-graphite-muted-foreground">
              {best && y ? (
                y.leader === "tie" ? (
                  `Nenhuma diferença até ${formatDate(best.maturity)}.`
                ) : (
                  <>
                    <span className="font-semibold text-graphite-foreground">{y.amount}</span>
                    {y.nearTie ? " de diferença" : " a mais"} até {formatDate(best.maturity)},{" "}
                    {y.share} do valor em {y.horizon}.
                  </>
                )
              ) : (
                "Compare antes de registrar sua próxima amortização."
              )}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="inverse" asChild>
                <Link to="/decidir" search={{ valor, comparar: true }}>
                  {y ? "Ver comparação" : "Comparar agora"}
                </Link>
              </Button>
              {y && (
                <Button variant="plain-inverse" asChild>
                  <Link to="/decidir" search={{ valor }}>
                    Mudar valor
                  </Link>
                </Button>
              )}
            </div>
          </div>
          {clearWinner && (
            <div aria-hidden="true" className="proto-answer-art relative hidden shrink-0 md:block">
              <img
                src={clearWinner === "invest" ? investIllustration : prepayIllustration}
                alt=""
                className="size-36 object-contain drop-shadow-glow"
              />
            </div>
          )}
        </div>
      </section>
      {best && <StaleNote marketData={best.market_data} />}
    </div>
  );
}
