import { Alert, AlertDescription } from "@/components/ui/alert";
import type { BondsStatus } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type Freshness = Pick<BondsStatus, "status" | "failed_at">;

/**
 * FreshnessWarning says what is wrong with a kind of market data, and renders nothing when it is
 * fresh. `missing` is what it says when there is no data yet.
 */
export function FreshnessWarning({ status, missing }: { status: Freshness; missing: string }) {
  switch (status.status) {
    case "stale":
      return (
        <Alert variant="warning">
          <AlertDescription>
            Dados desatualizados: a última atualização foi há mais de dois dias.
          </AlertDescription>
        </Alert>
      );
    case "failed":
      return (
        <Alert variant="destructive">
          <AlertDescription>
            A última atualização falhou
            {status.failed_at && ` em ${formatDateTime(status.failed_at)}`}.
          </AlertDescription>
        </Alert>
      );
    case "missing":
      return (
        <Alert variant="warning">
          <AlertDescription>{missing}</AlertDescription>
        </Alert>
      );
    default:
      return null;
  }
}
