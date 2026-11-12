// PROTOTYPE, throwaway: Decidir's verdict in "Orvalho nítido".
// B: one panel with the verdict, its yardsticks and a chart of the difference over time.
// C: the same verdict read as two columns, where the money is at the horizon in each option.
import { InfoIcon } from "lucide-react";
import { useId, useMemo } from "react";
import { Area, ComposedChart, Line, ReferenceDot, ReferenceLine, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import type { Decision, Scenario } from "@/lib/api";
import { type ComparedVerdict, verdictTitle } from "@/lib/decisions";
import { formatDate, formatMoney } from "@/lib/format";
import {
  crossover,
  gapPoints,
  headline,
  monthYear,
  scale,
  type Yardstick,
  yardstick,
} from "@/prototypes/verdictYardstick";

function marginNote(verdict: ComparedVerdict, y: Yardstick): string | undefined {
  if (verdict.no_break_even === "below_range")
    return "Investir rende mais mesmo se a taxa cair a zero.";
  if (verdict.no_break_even === "above_range") return "Amortizar rende mais mesmo a 100% ao ano.";
  if (!y.today || !y.breakEven) return undefined;
  return `Empata com amortizar se a taxa ${y.rateMoves} de ${y.today} para ${y.breakEven}.`;
}

const compact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const GAP_CONFIG = {
  gap: { label: "Diferença", color: "var(--chart-mortgage)" },
} satisfies ChartConfig;

function GapChart({ verdict }: { verdict: ComparedVerdict }) {
  const points = useMemo(() => gapPoints(verdict), [verdict]);
  const cross = crossover(points);
  const max = Math.max(0, ...points.map((p) => p.gap));
  const min = Math.min(0, ...points.map((p) => p.gap));
  const first = points[0].time;
  const last = points[points.length - 1].time;
  const years: number[] = [];
  for (let y = new Date(first).getUTCFullYear() + 1; y <= new Date(last).getUTCFullYear(); y++) {
    years.push(Date.UTC(y, 0, 1));
  }
  const step = Math.ceil(years.length / 6);
  const ticks = years.filter((_, i) => i % step === 0);
  const leaderAtEnd = points[points.length - 1].gap >= 0 ? "Investir" : "Amortizar";
  const crossText = cross && `${leaderAtEnd} passa à frente em ${monthYear(cross.time)}.`;

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-col gap-1">
        <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-headline">Diferença ao longo do tempo</span>
          {crossText && <span className="text-callout">{crossText}</span>}
        </span>
        <span className="text-footnote text-muted-foreground">
          Acima da linha, investir está à frente; abaixo, amortizar.
        </span>
      </figcaption>
      <div>
        <ChartContainer
          config={GAP_CONFIG}
          role="img"
          aria-label={`Diferença entre investir e amortizar, de ${monthYear(first)} a ${monthYear(last)}. ${crossText ?? ""} No fim, ${leaderAtEnd.toLowerCase()} termina com ${formatMoney(Math.abs(points[points.length - 1].gap).toFixed(2))} a mais.`}
          className="aspect-auto h-52"
        >
          <ComposedChart data={points} margin={{ top: 24, right: 12, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="time"
              type="number"
              scale="time"
              domain={[first, last]}
              ticks={ticks}
              tickFormatter={(t: number) => String(new Date(t).getUTCFullYear())}
              tickMargin={8}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              width={56}
              domain={[min * 1.15, max * 1.15]}
              ticks={
                -min > (max - min) * 0.2
                  ? [min, 0, max]
                  : max > (max - min) * 0.2
                    ? [0, max]
                    : [min, 0]
              }
              tickFormatter={(v: number) => compact.format(Math.abs(v))}
              axisLine={false}
              tickLine={false}
            />
            <Area
              dataKey="ahead"
              type="linear"
              stroke="none"
              fill="rgb(62 142 124 / 0.16)"
              isAnimationActive={false}
            />
            <Area
              dataKey="behind"
              type="linear"
              stroke="none"
              fill="rgb(29 29 31 / 0.06)"
              isAnimationActive={false}
            />
            <ReferenceLine y={0} stroke="#8e8e93" strokeWidth={1} />
            <Line
              dataKey="gap"
              type="linear"
              stroke="var(--color-gap)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            {cross && (
              <ReferenceDot
                x={cross.time}
                y={0}
                r={4}
                fill="#fff"
                stroke="#1d1d1f"
                strokeWidth={2}
              />
            )}
          </ComposedChart>
        </ChartContainer>
      </div>
    </figure>
  );
}

export function ProtoVerdictPanel({
  decision,
  verdict,
  stale,
}: {
  decision: Decision;
  verdict: ComparedVerdict;
  /** The stale-data note, kept next to the figure it qualifies. */
  stale?: React.ReactNode;
}) {
  const titleId = useId();
  const y = yardstick(decision, verdict);
  const note = marginNote(verdict, y);
  return (
    <section
      aria-labelledby={titleId}
      className="proto-verdict flex flex-col gap-6 rounded-lg glass p-8"
    >
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="text-title-2">
          {headline(y, verdictTitle(verdict))}
        </h2>
        <p className="mt-3 text-hero-figure">{y.amount}</p>
        <p className="text-callout text-muted-foreground">
          {scale(y, decision.amount, verdict.maturity)}
        </p>
        {note && (
          <p className="mt-3 flex items-start gap-2 text-callout">
            <InfoIcon
              aria-hidden="true"
              strokeWidth={1.75}
              className="mt-0.5 size-4 shrink-0 text-accent"
            />
            {note}
          </p>
        )}
        {stale && <div className="mt-1">{stale}</div>}
      </div>
      <div className="border-t pt-6">
        <GapChart verdict={verdict} />
      </div>
    </section>
  );
}

function inHand(s: Scenario) {
  const cash = Number(s.cash) + Number(s.bond?.net ?? 0);
  return cash > 0 ? formatMoney(cash.toFixed(2)) : undefined;
}

function standing(s: Scenario) {
  return Number(s.net_worth) < 0
    ? `deve ${formatMoney(s.net_worth.replace("-", ""))}`
    : `tem ${formatMoney(s.net_worth)}`;
}

export function ProtoLedgerPanel({
  decision,
  verdict,
}: {
  decision: Decision;
  verdict: ComparedVerdict;
}) {
  const titleId = useId();
  const y = yardstick(decision, verdict);
  const bond = verdictTitle(verdict);
  const date = formatDate(verdict.maturity);
  const columns = [
    {
      key: "prepay",
      title: "Se amortizar",
      subtitle: `${formatMoney(decision.amount)} hoje`,
      s: verdict.prepay,
      lead: y.leader === "prepay",
    },
    {
      key: "invest",
      title: "Se investir",
      subtitle: bond,
      s: verdict.invest,
      lead: y.leader === "invest",
    },
  ];
  return (
    <section
      aria-labelledby={titleId}
      className="proto-verdict flex flex-col gap-6 rounded-lg glass p-8"
    >
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="text-title-2">
          {headline(y, bond)}
        </h2>
        <p className="text-callout text-muted-foreground">
          Onde está o dinheiro em {date}, em cada opção.
        </p>
      </div>
      <div className="proto-ledger grid grid-cols-2 gap-3">
        {columns.map(({ key, title, subtitle, s, lead }) => (
          <div
            key={key}
            className={`flex flex-col gap-4 rounded-lg border p-5 ${lead && !y.nearTie ? "border-[color:var(--accent-soft)] bg-accent-tint/50" : "bg-card"}`}
          >
            <div>
              <p className="text-headline">{title}</p>
              <p className="text-footnote text-muted-foreground">{subtitle}</p>
            </div>
            <dl className="flex flex-col gap-3 text-callout">
              <div>
                <dt className="text-muted-foreground">Saldo devedor</dt>
                <dd className="text-title-2 tabular-nums">{formatMoney(s.outstanding_balance)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Dinheiro do título, líquido</dt>
                <dd className="text-title-2 tabular-nums">{inHand(s) ?? "Nenhum"}</dd>
              </div>
              <div className="border-t pt-3">
                <dt className="text-muted-foreground">No fim, você</dt>
                <dd className="text-headline tabular-nums">{standing(s)}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <p className="text-callout">
        {y.leader === "tie"
          ? "As duas opções terminam iguais."
          : `${y.leader === "invest" ? "Investir" : "Amortizar"} termina com ${y.amount} a mais, ${y.share} dos ${formatMoney(decision.amount)} em ${y.horizon}.`}
        {y.nearTie && y.leader !== "tie" && " Na prática, um empate."}
      </p>
    </section>
  );
}
