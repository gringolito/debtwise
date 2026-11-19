// PROTOTYPE: does Início's answer read as the page's main information, rather than an ad, once it
// leaves the graphite card? Four variants on `/?variant=`: the current card, then three without a
// card or black fill, set straight on the page's background. Throwaway; lives on its branch only.
import { Link, useSearch } from "@tanstack/react-router";
import { useId } from "react";
import investIllustration from "@/assets/answer-invest.webp";
import prepayIllustration from "@/assets/answer-prepay.webp";
import type { PrototypeVariant } from "@/components/patterns/PrototypeSwitcher";
import { Button } from "@/components/ui/button";
import type { Decision } from "@/lib/api";
import { bestVerdict } from "@/lib/dashboard";
import { type ComparedVerdict, favoured } from "@/lib/decisions";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { advantageAmount, advantageShare, horizon, verdictHeadline } from "@/lib/yardstick";
import { AnswerCard } from "@/pages/dashboard/AnswerCard";
import { StaleNote } from "@/pages/marketdata/StaleNote";

export const ANSWER_VARIANTS: PrototypeVariant[] = [
  { key: "atual", name: "Card graphite atual" },
  { key: "manchete", name: "Manchete no fundo" },
  { key: "numero", name: "Número em destaque" },
  { key: "centro", name: "Centralizado, com ilustração" },
];

const illustrations = { invest: investIllustration, prepay: prepayIllustration };

/**
 * The illustration inside a Liquid Glass app-icon tile: a squircle with a specular rim, a top-left
 * sheen and a soft floor shadow. `?icone=claro` swaps the graphite glass for the frosted light one.
 */
function AnswerIcon({ side, className }: { side: keyof typeof illustrations; className?: string }) {
  const search = useSearch({ strict: false }) as { icone?: unknown };
  const light = search.icone === "claro";
  return (
    <div
      aria-hidden="true"
      className={cn("glass-icon", light ? "glass" : "glass-primary", className)}
    >
      <img
        src={illustrations[side]}
        alt=""
        className={light ? "drop-shadow-sm" : "drop-shadow-glow"}
      />
    </div>
  );
}

function useAnswer(decision: Decision) {
  const best = bestVerdict(decision.verdicts);
  const side = best && favoured(best.advantage);
  const winner = side && side !== "even" && !best.near_tie ? side : undefined;
  return { best, winner, valor: Number(decision.amount), amount: formatMoney(decision.amount) };
}

function Lead({ amount, className }: { amount: string; className?: string }) {
  return (
    <p className={cn("flex items-center gap-2 text-footnote text-muted-foreground", className)}>
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-accent shadow-glow" />
      Na projeção atual, para {amount} hoje
    </p>
  );
}

function Yardstick({ verdict }: { verdict: ComparedVerdict }) {
  const until = formatDate(verdict.maturity);
  if (favoured(verdict.advantage) === "even") return <>Nenhuma diferença até {until}.</>;
  return (
    <>
      <span className="font-semibold text-foreground">{advantageAmount(verdict)}</span>
      {verdict.near_tie ? " de diferença" : " a mais"} até {until}, {advantageShare(verdict)} do
      valor em {horizon(verdict)}.
    </>
  );
}

function Actions({
  best,
  valor,
  className,
}: {
  best?: ComparedVerdict;
  valor: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button asChild>
        <Link to="/comparar" search={{ valor, comparar: true }}>
          {best ? "Ver comparação" : "Comparar agora"}
        </Link>
      </Button>
      {best && (
        <Button variant="plain" asChild>
          <Link to="/comparar" search={{ valor }}>
            Mudar valor
          </Link>
        </Button>
      )}
    </div>
  );
}

/** B: the headline set as the page's own Large Title, on the background, illustration beside it. */
function Headline({ decision }: { decision: Decision }) {
  const titleId = useId();
  const { best, winner, valor, amount } = useAnswer(decision);
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2 pb-2">
      <div className="flex items-center justify-between gap-8">
        <div className="flex min-w-0 max-w-140 flex-col gap-3">
          <Lead amount={amount} />
          <h2 id={titleId} className="text-large-title font-semibold text-balance">
            {best ? verdictHeadline(best) : "Amortizar ou investir? Veja a comparação."}
          </h2>
          <p className="text-body text-muted-foreground">
            {best ? (
              <Yardstick verdict={best} />
            ) : (
              "Compare antes de registrar sua próxima amortização."
            )}
          </p>
          <Actions best={best} valor={valor} className="mt-3" />
        </div>
        {winner && <AnswerIcon side={winner} className="hidden size-36 sm:block" />}
      </div>
      {best && <StaleNote marketData={best.market_data} />}
    </section>
  );
}

/** C: the advantage itself as the hero figure, with the headline as what it measures. */
function Figure({ decision }: { decision: Decision }) {
  const titleId = useId();
  const { best, winner, valor, amount } = useAnswer(decision);
  const even = best && favoured(best.advantage) === "even";
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2 pb-2">
      <p className="text-footnote tracking-wide text-muted-foreground uppercase">
        Na projeção atual, para {amount} hoje
      </p>
      {best && !even ? (
        <>
          <p
            className={cn(
              "text-hero-figure tabular-nums",
              winner ? "text-positive" : "text-foreground",
            )}
          >
            {winner && "+"}
            {advantageAmount(best)}
          </p>
          <h2 id={titleId} className="text-title-2">
            {verdictHeadline(best)}
          </h2>
          <p className="text-callout text-muted-foreground">
            {best.near_tie ? "De diferença" : "A mais"} até {formatDate(best.maturity)},{" "}
            {advantageShare(best)} do valor em {horizon(best)}.
          </p>
        </>
      ) : (
        <>
          <h2 id={titleId} className="text-large-title font-semibold">
            {best ? verdictHeadline(best) : "Amortizar ou investir?"}
          </h2>
          <p className="text-callout text-muted-foreground">
            {best ? (
              <Yardstick verdict={best} />
            ) : (
              "Compare antes de registrar sua próxima amortização."
            )}
          </p>
        </>
      )}
      <Actions best={best} valor={valor} className="mt-4" />
      {best && <StaleNote marketData={best.market_data} />}
    </section>
  );
}

/** D: a centered answer under its illustration, closed by a hairline before the panels. */
function Centered({ decision }: { decision: Decision }) {
  const titleId = useId();
  const { best, winner, valor, amount } = useAnswer(decision);
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col items-center gap-3 border-b pt-2 pb-10 text-center"
    >
      {winner && <AnswerIcon side={winner} className="mb-2 size-24" />}
      <Lead amount={amount} />
      <h2 id={titleId} className="max-w-160 text-large-title font-semibold text-balance">
        {best ? verdictHeadline(best) : "Amortizar ou investir? Veja a comparação."}
      </h2>
      <p className="max-w-140 text-body text-muted-foreground">
        {best ? (
          <Yardstick verdict={best} />
        ) : (
          "Compare antes de registrar sua próxima amortização."
        )}
      </p>
      <Actions best={best} valor={valor} className="mt-3 justify-center" />
      {best && <StaleNote marketData={best.market_data} />}
    </section>
  );
}

export function AnswerHero({ variant, decision }: { variant: string; decision: Decision }) {
  switch (variant) {
    case "manchete":
      return <Headline decision={decision} />;
    case "numero":
      return <Figure decision={decision} />;
    case "centro":
      return <Centered decision={decision} />;
    default:
      return <AnswerCard decision={decision} />;
  }
}
