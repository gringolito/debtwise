import { ClockIcon } from "lucide-react";
import type { StaleSource } from "@/lib/dashboard";
import { formatInstantDayMonth } from "@/lib/format";

/**
 * StaleSourcesNote names each source a screen shows that is not fresh, with the day of its last
 * update.
 * It shows nothing while every source is fresh.
 */
export function StaleSourcesNote({ sources }: { sources: StaleSource[] }) {
  if (sources.length === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 px-1 text-footnote text-caution">
      <ClockIcon aria-hidden="true" strokeWidth={1.5} className="size-4" />
      {sources
        .map(({ name, refreshedAt }) =>
          refreshedAt
            ? `${name} de ${formatInstantDayMonth(refreshedAt)}.`
            : `${name} indisponível.`,
        )
        .join(" ")}
    </p>
  );
}
