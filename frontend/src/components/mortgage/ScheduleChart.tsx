import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { SegmentedControl, SegmentedControlItem } from "@/components/patterns/SegmentedControl";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import type { ScheduledInstallment } from "@/lib/api";
import { formatMonthYear } from "@/lib/format";
import { type TrendPoint, trend } from "@/lib/scheduleTrend";

type View = "balance" | "installment" | "composition";

const titles: Record<View, string> = {
  balance: "Saldo devedor ao longo do tempo",
  installment: "Prestação ao longo do tempo",
  composition: "Composição da prestação",
};

const TREND_CONFIG = {
  paid: { label: "Amortizado", color: "var(--chart-mortgage)" },
  projected: { label: "Projeção", color: "var(--chart-projection)" },
} satisfies ChartConfig;

const COMPOSITION_CONFIG = {
  amortization: { label: "Amortização", color: "var(--chart-mortgage)" },
  interest: { label: "Juros", color: "var(--accent-soft)" },
  charges: { label: "Seguros e taxa", color: "var(--chart-projection)" },
} satisfies ChartConfig;

const tickFormat = new Intl.NumberFormat("pt-BR", { notation: "compact" });
// Room above the plot for the today line's label.
const CHART_MARGIN = { top: 24, right: 8 };
const yearOf = (time: number) => String(new Date(time).getUTCFullYear());
const timeOf = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`);

interface DotProps {
  cx?: number;
  cy?: number;
  index?: number;
  stroke?: string;
  payload?: TrendPoint;
}

/** PrepaymentDot rings the points of the installments that prepayments followed. */
function PrepaymentDot({ cx, cy, index, stroke, payload }: DotProps) {
  if (!payload?.prepaid || cx === undefined || cy === undefined) return <g key={index} />;
  return (
    <circle key={index} cx={cx} cy={cy} r={4} fill="var(--card)" stroke={stroke} strokeWidth={2} />
  );
}

function TrendLegend() {
  return (
    <ul className="flex items-center gap-4 text-footnote text-muted-foreground">
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-0.5 w-3 bg-foreground" />
        Amortizado
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

interface ScheduleChartProps extends React.ComponentProps<"section"> {
  installments: ScheduledInstallment[];
  contractDate: string;
  originalAmount: string;
  today: string;
}

/** ScheduleChart plots the schedule's balance, installment or installment breakdown over time. */
export function ScheduleChart({
  installments,
  contractDate,
  originalAmount,
  today,
  ...props
}: ScheduleChartProps) {
  const [view, setView] = useState<View>("balance");
  const balance = useMemo(
    () =>
      trend(installments, (installment) => installment.outstanding_balance, today, {
        date: contractDate,
        value: originalAmount,
      }),
    [installments, today, contractDate, originalAmount],
  );
  const amount = useMemo(
    () => trend(installments, (installment) => installment.amount, today),
    [installments, today],
  );
  const composition = useMemo(
    () =>
      installments.map((installment) => ({
        time: timeOf(installment.due_date),
        amortization: Number(installment.amortization),
        interest: Number(installment.interest),
        charges: Number(installment.mip) + Number(installment.dfi) + Number(installment.fee),
      })),
    [installments],
  );
  const todayTime = timeOf(today);
  const inRange =
    installments.length > 0 &&
    todayTime >= timeOf(contractDate) &&
    todayTime <= timeOf(installments[installments.length - 1].due_date);

  const axes = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis
        dataKey="time"
        type="number"
        scale="time"
        domain={["dataMin", "dataMax"]}
        tickFormatter={yearOf}
        minTickGap={48}
        tickMargin={8}
      />
      <YAxis width={56} tickFormatter={(value: number) => tickFormat.format(value)} />
      {inRange && (
        <ReferenceLine
          x={todayTime}
          stroke="var(--accent)"
          strokeDasharray="2 3"
          label={{
            value: `Hoje (${formatMonthYear(today)})`,
            position: "top",
            fill: "var(--accent)",
          }}
        />
      )}
    </>
  );

  return (
    <section
      aria-label={titles[view]}
      className="flex flex-col gap-6 rounded-lg glass p-6"
      {...props}
    >
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-headline">{titles[view]}</h2>
        <div className="flex items-center gap-6">
          {view !== "composition" && <TrendLegend />}
          <SegmentedControl value={view} onValueChange={setView} aria-label="Gráfico">
            <SegmentedControlItem value="balance">Saldo</SegmentedControlItem>
            <SegmentedControlItem value="installment">Prestação</SegmentedControlItem>
            <SegmentedControlItem value="composition">Composição</SegmentedControlItem>
          </SegmentedControl>
        </div>
      </header>
      {view === "composition" ? (
        <ChartContainer
          config={COMPOSITION_CONFIG}
          role="img"
          aria-label="Amortização, juros, seguros e taxa de cada prestação"
          className="aspect-auto h-64"
        >
          <AreaChart data={composition} margin={CHART_MARGIN}>
            {axes}
            {(["amortization", "interest", "charges"] as const).map((key) => (
              <Area
                key={key}
                dataKey={key}
                stackId="installment"
                type="stepAfter"
                stroke="none"
                fill={`var(--color-${key})`}
                fillOpacity={1}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ChartContainer>
      ) : (
        <ChartContainer
          config={TREND_CONFIG}
          role="img"
          aria-label={titles[view]}
          className="aspect-auto h-64"
        >
          <LineChart data={view === "balance" ? balance : amount} margin={CHART_MARGIN}>
            {axes}
            <Line
              dataKey="paid"
              type="linear"
              stroke="var(--color-paid)"
              strokeWidth={2}
              dot={PrepaymentDot}
              isAnimationActive={false}
            />
            <Line
              dataKey="projected"
              type="linear"
              stroke="var(--color-projected)"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={PrepaymentDot}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      )}
      {view === "composition" && (
        <ul className="flex justify-center gap-4 text-footnote text-muted-foreground">
          {Object.entries(COMPOSITION_CONFIG).map(([key, { label, color }]) => (
            <li key={key} className="flex items-center gap-1.5">
              <svg aria-hidden="true" viewBox="0 0 8 8" className="size-2">
                <circle cx="4" cy="4" r="4" fill={color} />
              </svg>
              {label}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
