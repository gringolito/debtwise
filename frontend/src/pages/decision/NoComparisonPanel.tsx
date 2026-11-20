import { Link } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { type NoComparison, noComparisonExplanation } from "@/lib/decisions";
import { formatMoney } from "@/lib/format";

/** NoComparisonFix is what the owner can do about why a bond is not compared, as a text action. */
export function NoComparisonFix({
  why,
  onUseAmount,
}: {
  why: NoComparison;
  onUseAmount: (amount: string) => void;
}) {
  switch (why.reason) {
    case "amount_too_small":
      return (
        <Button variant="link" size="inline" onClick={() => onUseAmount(why.minimumAmount)}>
          Usar {formatMoney(why.minimumAmount)}
        </Button>
      );
    case "missing_ipca":
      return (
        <Button variant="link" size="inline" asChild>
          <Link to="/mercado/indices/$index" params={{ index: "ipca" }}>
            Ver projeções do IPCA
          </Link>
        </Button>
      );
    case "no_bond":
      return (
        <Button variant="link" size="inline" asChild>
          <Link to="/mercado/titulos">Ver títulos à venda</Link>
        </Button>
      );
  }
}

interface NoComparisonPanelProps {
  why: NoComparison;
  /** Puts the amount in the sentence and compares it. */
  onUseAmount: (amount: string) => void;
}

/** NoComparisonPanel says why a decision compares no bond and what the owner can try instead. */
export function NoComparisonPanel({ why, onUseAmount }: NoComparisonPanelProps) {
  const titleId = useId();
  const { title, text } = noComparisonExplanation(why);
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col items-center rounded-lg glass px-12 py-16 text-center"
    >
      <div className="mb-6 flex size-14 items-center justify-center rounded-lg bg-muted">
        <InfoIcon aria-hidden="true" strokeWidth={1.5} className="size-6 text-muted-foreground" />
      </div>
      <h2 id={titleId} className="mb-2 text-title-2">
        {title}
      </h2>
      <p className="mb-8 max-w-md text-callout text-muted-foreground">{text}</p>
      <NoComparisonFix why={why} onUseAmount={onUseAmount} />
    </section>
  );
}
