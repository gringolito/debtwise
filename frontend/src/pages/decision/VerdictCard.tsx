import { InfoIcon } from "lucide-react";
import { useId } from "react";
import {
  breakEvenNote,
  type ComparedVerdict,
  type Favoured,
  favoured,
  signedAdvantage,
  verdictTitle,
} from "@/lib/decisions";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const headings: Record<Favoured, string> = {
  invest: "Investir rende mais",
  prepay: "Amortizar rende mais",
  even: "Investir ou amortizar dá no mesmo",
};

const colors: Record<Favoured, string> = {
  invest: "text-positive",
  prepay: "text-destructive",
  even: "",
};

/**
 * VerdictCard states a compared verdict: which option ends with more, the Advantage of investing
 * in the bond over prepaying on its maturity, and the rate at which both tie.
 */
export function VerdictCard({ verdict }: { verdict: ComparedVerdict }) {
  const titleId = useId();
  const side = favoured(verdict.advantage);
  const note = breakEvenNote(verdict);
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-6 rounded-lg border bg-card p-8"
    >
      <div className="flex flex-col gap-2">
        <p className="text-footnote font-medium tracking-wide text-muted-foreground uppercase">
          {headings[side]}
        </p>
        <h2 id={titleId} className="text-title-2">
          {verdictTitle(verdict)}
        </h2>
        <p className={cn("mt-2 text-hero-figure", colors[side])}>
          {signedAdvantage(verdict.advantage)}
        </p>
        <p className="text-callout text-muted-foreground">
          em relação a amortizar, até {formatDate(verdict.maturity)}.
        </p>
      </div>
      {note && (
        <p className="flex items-center gap-2 border-t pt-4 text-footnote text-muted-foreground">
          <InfoIcon aria-hidden="true" strokeWidth={1.5} className="size-4 shrink-0" />
          {note}
        </p>
      )}
    </section>
  );
}
