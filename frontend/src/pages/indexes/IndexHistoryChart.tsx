import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import type { IndexValue } from "@/lib/api";
import { formatDate } from "@/lib/format";

const CHART_CONFIG = {
  value: { label: "Valor", color: "var(--chart-2)" },
} satisfies ChartConfig;

const tickFormat = new Intl.NumberFormat("pt-BR");

// Thousands of points: no dots and no animation, or every redraw crawls.
export function IndexHistoryChart({
  title,
  values,
  ...props
}: { title: string; values: IndexValue[] } & Omit<
  React.ComponentProps<typeof ChartContainer>,
  "config" | "children"
>) {
  // Plotting is the one place a value becomes a Number; the screen text keeps the decimal string.
  const points = useMemo(
    () => values.map((v) => ({ period_start: v.period_start, value: Number(v.value) })),
    [values],
  );

  return (
    <ChartContainer
      config={CHART_CONFIG}
      role="img"
      aria-label={`Histórico de ${title}`}
      {...props}
    >
      <LineChart data={points}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="period_start" tickFormatter={formatDate} minTickGap={48} tickMargin={8} />
        <YAxis
          width={48}
          domain={["auto", "auto"]}
          tickFormatter={(value: number) => tickFormat.format(value)}
        />
        <Line
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
