import type { BondsStatus, VerdictMarketData } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { indexNames } from "@/lib/indexNames";
import { FreshnessWarning } from "@/pages/marketdata/FreshnessWarning";

type Freshness = Pick<BondsStatus, "status" | "failed_at" | "refreshed_at">;

function FreshnessItem({
  name,
  status,
  missing,
}: {
  name: string;
  status: Freshness;
  missing: string;
}) {
  return (
    <li className="flex flex-col gap-1">
      <span>
        {name}:{" "}
        {status.refreshed_at
          ? `Atualizado em ${formatDateTime(status.refreshed_at)}`
          : "Nunca atualizado"}
      </span>{" "}
      <FreshnessWarning status={status} missing={missing} />
    </li>
  );
}

/** MarketDataFreshness says how fresh each kind of market data a verdict reads is. */
export function MarketDataFreshness({ marketData }: { marketData: VerdictMarketData }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium">Dados de mercado</p>
      <ul aria-label="Dados de mercado" className="flex flex-col gap-2">
        <FreshnessItem
          name="Preços dos títulos"
          status={marketData.bonds}
          missing="Ainda não há preços de títulos."
        />
        <FreshnessItem
          name="Focus"
          status={marketData.focus}
          missing="Ainda não há expectativas do Focus."
        />
        {marketData.indexes.map((index) => (
          <FreshnessItem
            key={index.index}
            name={indexNames[index.index]}
            status={index}
            missing="Ainda não há dados deste índice."
          />
        ))}
      </ul>
    </div>
  );
}
