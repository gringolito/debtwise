import { ClockIcon } from "lucide-react";
import type { StaleSource } from "@/lib/dashboard";
import { formatInstantDayMonth } from "@/lib/format";

/**
 * StaleSourcesNote names each source of market data that is not fresh, with the day of its last
 * update, followed by `children`, such as an action. It shows nothing while every source is fresh.
 */
export function StaleSourcesNote({
  sources,
  children,
}: {
  sources: StaleSource[];
  children?: React.ReactNode;
}) {
  if (sources.length === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 px-1 text-footnote text-caution">
      <ClockIcon aria-hidden="true" strokeWidth={1.5} className="size-4" />
      <span>
        {sources
          .map(({ name, refreshedAt }) =>
            refreshedAt
              ? `${name} de ${formatInstantDayMonth(refreshedAt)}.`
              : `${name} indisponível.`,
          )
          .join(" ")}
      </span>
      {children && <> {children}</>}
    </p>
  );
}
