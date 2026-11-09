import { cn } from "@/lib/utils";
import { CloudOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorPanelProps extends React.ComponentProps<"section"> {
  title: string;
  description?: string;
  /** Refetches what failed, such as the failed query's refetch. */
  onRetry: () => void;
}

export function ErrorPanel({
  title,
  description = "Verifique sua conexão. Seus dados estão salvos.",
  onRetry,
  className,
  ...props
}: ErrorPanelProps) {
  return (
    <section
      role="alert"
      className={cn(
        "flex min-h-110 flex-col items-center justify-center rounded-lg glass p-12 text-center",
        className,
      )}
      {...props}
    >
      <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-muted">
        <CloudOffIcon
          aria-hidden="true"
          strokeWidth={1.5}
          className="size-7 text-muted-foreground"
        />
      </div>
      <h2 className="mb-2 text-headline">{title}</h2>
      <p className="mb-8 text-callout text-muted-foreground">{description}</p>
      <Button onClick={onRetry}>Tentar novamente</Button>
    </section>
  );
}
