import { useMemo } from "react";
import { Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import type { ScheduledInstallment } from "@/lib/api";
import { balancePoints } from "@/lib/balanceCurve";
import { formatMonth } from "@/lib/format";

const CHART_CONFIG = {
  paid: { label: "Amortizado", color: "var(--chart-mortgage)" },
  projected: { label: "Projeção", color: "var(--chart-projection)" },
} satisfies ChartConfig;

const compactMoney = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
});

interface BalanceCurveProps {
  contractDate: string;
  originalAmount: string;
  installments: ScheduledInstallment[];
  /** Splits the curve: the balance up to it is paid off, and after it a projection. */
  today: string;
}

/** BalanceCurve draws the outstanding balance from the contract to the last installment. */
export function BalanceCurve({
  contractDate,
  originalAmount,
  installments,
  today,
}: BalanceCurveProps) {
  const points = useMemo(
    () => balancePoints(contractDate, originalAmount, installments, today),
    [contractDate, originalAmount, installments, today],
  );
  const first = points[0];
  const last = points[points.length - 1];
  // The point on today's side of the split, where both lines meet.
  const now = points.findLast((point) => point.paid !== undefined && point !== first);
  const endLabel = (date: string, balance: number | undefined) =>
    `${date.slice(0, 4)} · ${compactMoney.format(balance ?? 0)}`;

  return (
    <div role="img" aria-label="Saldo devedor ao longo do tempo" className="flex flex-col gap-1">
      <ChartContainer config={CHART_CONFIG} className="aspect-auto h-40 w-full">
        <LineChart data={points} margin={{ top: 24, right: 8, bottom: 0, left: 8 }}>
          <XAxis dataKey="date" hide />
          <YAxis hide domain={[0, "dataMax"]} />
          {now && now !== last && (
            <ReferenceLine
              x={now.date}
              stroke="var(--accent-mark)"
              strokeDasharray="2 2"
              label={{
                value: `Hoje (${formatMonth(today)})`,
                position: "top",
                fill: "var(--accent)",
              }}
            />
          )}
          <Line
            dataKey="paid"
            stroke="var(--color-paid)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="projected"
            stroke="var(--color-projected)"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
          <ChartLegend
            verticalAlign="top"
            align="right"
            content={<ChartLegendContent verticalAlign="top" className="justify-end" />}
          />
        </LineChart>
      </ChartContainer>
      <p aria-hidden="true" className="flex justify-between text-footnote text-muted-foreground">
        <span>{endLabel(first.date, first.paid ?? first.projected)}</span>
        <span>{endLabel(last.date, last.projected)}</span>
      </p>
    </div>
  );
}
