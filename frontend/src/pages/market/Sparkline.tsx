import type { SeriesPoint } from "@/lib/indexSeries";

const WIDTH = 120;
const HEIGHT = 32;
// Room for half the stroke, so the highest and lowest values are not clipped.
const INSET = 2;

/** Sparkline draws an index's recent values solid and its projection dashed, without axes. */
export function Sparkline({ points }: { points: SeriesPoint[] }) {
  if (points.length < 2) return <span aria-hidden="true" className="w-30 shrink-0 max-sm:hidden" />;

  const times = points.map((p) => p.time);
  const values = points.flatMap((p) => [p.history, p.projection]).filter((v) => v !== undefined);
  const [t0, t1] = [Math.min(...times), Math.max(...times)];
  const [v0, v1] = [Math.min(...values), Math.max(...values)];
  const x = (time: number) => INSET + ((time - t0) / (t1 - t0 || 1)) * (WIDTH - 2 * INSET);
  // A flat series sits mid-height.
  const y = (value: number) =>
    v1 === v0 ? HEIGHT / 2 : HEIGHT - INSET - ((value - v0) / (v1 - v0)) * (HEIGHT - 2 * INSET);
  const line = (key: "history" | "projection") =>
    points
      .filter((p) => p[key] !== undefined)
      .map((p) => `${x(p.time).toFixed(1)},${y(p[key] as number).toFixed(1)}`)
      .join(" ");

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-8 w-30 shrink-0 overflow-visible max-sm:hidden"
      fill="none"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points={line("history")} stroke="var(--chart-mortgage)" />
      <polyline
        points={line("projection")}
        stroke="var(--chart-projection)"
        strokeDasharray="3 3"
      />
    </svg>
  );
}
