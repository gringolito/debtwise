import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { BondsStatus } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type Freshness = Pick<BondsStatus, "status" | "failed_at">;

function describe(
  status: Freshness,
  missing: string,
): { variant: "warning" | "destructive"; text: string } | null {
  switch (status.status) {
    case "stale":
      return {
        variant: "warning",
        text: "Dados desatualizados: a última atualização foi há mais de dois dias.",
      };
    case "failed":
      return {
        variant: "destructive",
        text: `A última atualização falhou${status.failed_at ? ` em ${formatDateTime(status.failed_at)}` : ""}.`,
      };
    case "missing":
      return { variant: "warning", text: missing };
    default:
      return null;
  }
}

/**
 * FreshnessWarning says what is wrong with a kind of market data, and renders nothing when it is
 * fresh. `missing` is what it says when there is no data yet. `title` names the data when the
 * page is not about that data alone.
 */
export function FreshnessWarning({
  status,
  missing,
  title,
}: {
  status: Freshness;
  missing: string;
  title?: string;
}) {
  const warning = describe(status, missing);
  if (!warning) return null;
  return (
    <Alert variant={warning.variant}>
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription>{warning.text}</AlertDescription>
    </Alert>
  );
}
