import { cn } from "cn";
import { Alert, AlertDescription } from "@/components/ui/alert";

type EventFormProps = React.ComponentProps<"form"> & {
  /** What the alert says; null while the last save did not fail or the failure names a field. */
  failure: string | null;
};

/**
 * EventForm lays out the fields and buttons its caller puts in it, with an alert above them when
 * its caller reports a failure no field shows. The caller names it with `aria-label`.
 */
export function EventForm({ failure, className, children, ...props }: EventFormProps) {
  return (
    <form noValidate className={cn("flex flex-col gap-4", className)} {...props}>
      {failure && (
        <Alert variant="destructive">
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-end gap-4">{children}</div>
    </form>
  );
}
