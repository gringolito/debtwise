import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { SegmentedControl, SegmentedControlItem } from "@/components/patterns/SegmentedControl";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import type { IndexName, IndexValue, ProjectedValue } from "@/lib/api";
import { formatMonth } from "@/lib/format";
import { indexNames } from "@/lib/indexNames";
import { addMonths, plottedValues, seriesPoints, timeOf } from "@/lib/indexSeries";
import { marketIndexes } from "@/lib/marketIndexes";

type Years = "1" | "5" | "10";

const CHART_CONFIG = {
  history: { label: "Histórico", color: "var(--chart-mortgage)" },
  projection: { label: "Projeção", color: "var(--chart-projection)" },
} satisfies ChartConfig;

const tickNumber = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });
// Room above the plot for the today line's label.
const CHART_MARGIN = { top: 24, right: 8 };

const isoOf = (time: number) => new Date(time).toISOString().slice(0, 10);

function Legend() {
  return (
    <ul className="flex items-center gap-4 text-footnote text-muted-foreground">
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-0.5 w-3 bg-foreground" />
        Histórico
      </li>
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="w-3 border-t-2 border-dashed border-tertiary-foreground"
        />
        Projeção
      </li>
    </ul>
  );
}

interface IndexChartProps {
  index: IndexName;
  values: IndexValue[];
  projection: ProjectedValue[];
  today: string;
}

/**
 * IndexChart plots an index's published values solid and its projection dashed over the last one,
 * five or ten years, with the projection running half as far ahead.
 */
export function IndexChart({ index, values, projection, today }: IndexChartProps) {
  const [years, setYears] = useState<Years>("5");
  const months = Number(years) * 12;
  const from = addMonths(today, -months);
  const to = addMonths(today, months / 2);
  const points = useMemo(
    () => seriesPoints(plottedValues(index, values), projection, from, to),
    [index, values, projection, from, to],
  );
  const projected = points.some((p) => p.projection !== undefined);
  const title = projected ? "Histórico e projeção" : "Histórico";
  const percent = marketIndexes[index].unit !== "";
  const todayTime = timeOf(today);
  const showsToday =
    points.length > 0 && todayTime >= points[0].time && todayTime <= points[points.length - 1].time;
  // Ticks on the 1st of each year, or of each quarter over one year, so no label repeats.
  const step = years === "1" ? 3 : 12;
  const ticks: number[] = [];
  if (points.length > 0) {
    const last = points[points.length - 1].time;
    for (
      let tick = `${isoOf(points[0].time).slice(0, 4)}-01-01`;
      timeOf(tick) <= last;
      tick = addMonths(tick, step)
    ) {
      if (timeOf(tick) >= points[0].time) ticks.push(timeOf(tick));
    }
  }

  return (
    <section aria-label={title} className="flex flex-col gap-6 rounded-lg border bg-card p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-headline">{title}</h2>
        <div className="flex items-center gap-6">
          {projected && <Legend />}
          <SegmentedControl value={years} onValueChange={setYears} aria-label="Período">
            <SegmentedControlItem value="1">1 ano</SegmentedControlItem>
            <SegmentedControlItem value="5">5 anos</SegmentedControlItem>
            <SegmentedControlItem value="10">10 anos</SegmentedControlItem>
          </SegmentedControl>
        </div>
      </header>
      <ChartContainer
        config={CHART_CONFIG}
        role="img"
        aria-label={`${title} de ${indexNames[index]}`}
        className="aspect-auto h-64"
      >
        {/* Thousands of points: no dots and no animation, or every redraw crawls. */}
        <LineChart data={points} margin={CHART_MARGIN}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="time"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            ticks={ticks}
            tickFormatter={(time: number) =>
              years === "1" ? formatMonth(isoOf(time)) : isoOf(time).slice(0, 4)
            }
            minTickGap={48}
            tickMargin={8}
          />
          <YAxis
            width={56}
            domain={["auto", "auto"]}
            tickFormatter={(value: number) => `${tickNumber.format(value)}${percent ? "%" : ""}`}
          />
          {showsToday && (
            <ReferenceLine
              x={todayTime}
              stroke="var(--accent)"
              strokeDasharray="2 3"
              label={{ value: "Hoje", position: "top", fill: "var(--accent)" }}
            />
          )}
          <Line
            dataKey="history"
            type="linear"
            stroke="var(--color-history)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="projection"
            type="linear"
            stroke="var(--color-projection)"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
    </section>
  );
}
