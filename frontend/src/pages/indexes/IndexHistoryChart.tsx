import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import type { IndexValue, ProjectedValue } from "@/lib/api";
import { formatDate } from "@/lib/format";

const CHART_CONFIG = {
  value: { label: "Valor", color: "var(--chart-2)" },
  projection: { label: "Projeção", color: "var(--chart-2)" },
} satisfies ChartConfig;

const tickFormat = new Intl.NumberFormat("pt-BR");

interface Point {
  period_start: string;
  value?: number;
  projection?: number;
}

const NO_PROJECTION: ProjectedValue[] = [];

// Thousands of points: no dots and no animation, or every redraw crawls.
export function IndexHistoryChart({
  title,
  values,
  projection = NO_PROJECTION,
  ...props
}: { title: string; values: IndexValue[]; projection?: ProjectedValue[] } & Omit<
  React.ComponentProps<typeof ChartContainer>,
  "config" | "children"
>) {
  // Plotting is the one place a value becomes a Number; the screen text keeps the decimal string.
  // The projection starts from the last published value, so the two lines meet.
  const points = useMemo(() => {
    const path: Point[] = values.map((v) => ({
      period_start: v.period_start,
      value: Number(v.value),
    }));
    const last = path.at(-1);
    if (last && projection.length > 0) last.projection = last.value;
    for (const v of projection) {
      path.push({ period_start: v.period_start, projection: Number(v.value) });
    }
    return path;
  }, [values, projection]);
  const projected = projection.length > 0;

  return (
    <ChartContainer
      config={CHART_CONFIG}
      role="img"
      aria-label={projected ? `Histórico e projeção de ${title}` : `Histórico de ${title}`}
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
        {projected && (
          <Line
            dataKey="projection"
            type="monotone"
            stroke="var(--color-projection)"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            isAnimationActive={false}
          />
        )}
        {projected && <ChartLegend content={<ChartLegendContent />} />}
      </LineChart>
    </ChartContainer>
  );
}
