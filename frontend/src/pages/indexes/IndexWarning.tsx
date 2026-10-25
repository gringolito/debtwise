import { Alert, AlertDescription } from "@/components/ui/alert";
import type { IndexStatus } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

/** IndexWarning says what is wrong with an index's data, and renders nothing when it is fresh. */
export function IndexWarning({ status }: { status: IndexStatus }) {
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
          <AlertDescription>Ainda não há dados deste índice.</AlertDescription>
        </Alert>
      );
    default:
      return null;
  }
}
