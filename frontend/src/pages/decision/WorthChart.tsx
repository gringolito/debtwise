import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import type { ComparedVerdict } from "@/lib/decisions";
import { worthPoints } from "@/lib/worthCurve";

const CHART_CONFIG = {
  prepay: { label: "Amortizar", color: "var(--chart-mortgage)" },
  invest: { label: "Investir", color: "var(--chart-investment)" },
} satisfies ChartConfig;

const yearOf = (time: number) => String(new Date(time).getUTCFullYear());
const MAX_TICKS = 6;

// The first days of the years from the decision to the horizon, a few years apart when they're many.
function yearTicks(from: number, to: number): number[] {
  const first = new Date(from).getUTCFullYear() + 1;
  const last = new Date(to).getUTCFullYear();
  const step = Math.max(1, Math.ceil((last - first + 1) / MAX_TICKS));
  const ticks: number[] = [];
  for (let year = first; year <= last; year += step) ticks.push(Date.UTC(year, 0, 1));
  return ticks;
}

function Legend() {
  return (
    <ul className="flex items-center gap-4 text-footnote text-muted-foreground">
      {Object.entries(CHART_CONFIG).map(([key, { label, color }]) => (
        <li key={key} className="flex items-center gap-1.5">
          <svg aria-hidden="true" viewBox="0 0 8 8" className="size-2">
            <circle cx="4" cy="4" r="4" fill={color} />
          </svg>
          {label}
        </li>
      ))}
    </ul>
  );
}

/** WorthChart plots the net worth of prepaying and of investing from the decision to the horizon. */
export function WorthChart({ verdict }: { verdict: ComparedVerdict }) {
  const points = useMemo(
    () => worthPoints(verdict.invest, verdict.prepay),
    [verdict.invest, verdict.prepay],
  );
  const title = "Patrimônio ao longo do tempo";
  return (
    <section aria-label={title} className="flex flex-col gap-6 rounded-lg glass p-6">
      <header className="flex items-center justify-between gap-4">
        <h2 className="text-headline">{title}</h2>
        <Legend />
      </header>
      <ChartContainer
        config={CHART_CONFIG}
        role="img"
        aria-label="Patrimônio ao amortizar e ao investir, por data, até o vencimento do título"
        className="aspect-auto h-64"
      >
        <LineChart data={points} margin={{ top: 8, right: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="4 4" />
          <XAxis
            dataKey="time"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            ticks={yearTicks(points[0].time, points[points.length - 1].time)}
            tickFormatter={yearOf}
            tickMargin={8}
          />
          <YAxis hide domain={["auto", "auto"]} />
          <Line
            dataKey="prepay"
            type="linear"
            stroke="var(--color-prepay)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="invest"
            type="linear"
            stroke="var(--color-invest)"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
    </section>
  );
}
