import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import type { Scenario } from "@/lib/api";
import { formatDate } from "@/lib/format";

const CHART_CONFIG = {
  invest: { label: "Investir", color: "var(--chart-1)" },
  prepay: { label: "Amortizar", color: "var(--chart-2)" },
} satisfies ChartConfig;

const tickFormat = new Intl.NumberFormat("pt-BR", { notation: "compact" });

interface Point {
  date: string;
  invest?: number;
  prepay?: number;
}

/** BalanceChart draws the Outstanding Balance of both scenarios of a verdict over time. */
export function BalanceChart({
  invest,
  prepay,
  ...props
}: { invest: Scenario; prepay: Scenario } & Omit<
  React.ComponentProps<typeof ChartContainer>,
  "config" | "children"
>) {
  // Plotting is the one place a balance becomes a Number; the screen text keeps the decimal string.
  // The scenarios have flows on different dates, so each line joins the points it has.
  const points = useMemo(() => {
    const byDate = new Map<string, Point>();
    for (const [key, scenario] of [
      ["invest", invest],
      ["prepay", prepay],
    ] as const) {
      for (const flow of scenario.cash_flows) {
        const point = byDate.get(flow.date) ?? { date: flow.date };
        point[key] = Number(flow.outstanding_balance);
        byDate.set(flow.date, point);
      }
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [invest, prepay]);

  return (
    <ChartContainer
      config={CHART_CONFIG}
      role="img"
      aria-label="Saldo devedor ao investir e ao amortizar"
      {...props}
    >
      <LineChart data={points}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickFormatter={formatDate} minTickGap={48} tickMargin={8} />
        <YAxis width={56} tickFormatter={(value: number) => tickFormat.format(value)} />
        {(["invest", "prepay"] as const).map((key) => (
          <Line
            key={key}
            dataKey={key}
            type="stepAfter"
            stroke={`var(--color-${key})`}
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        ))}
        <ChartLegend content={<ChartLegendContent />} />
      </LineChart>
    </ChartContainer>
  );
}
