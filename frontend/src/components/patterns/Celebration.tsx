import { ArrowRightIcon, type LucideIcon, PartyPopperIcon } from "lucide-react";
import { createContext, use } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * A celebration cheers a new record and a milestone cheers it louder, such as a mortgage paid off.
 * A notice informs, without animation, after a correction.
 */
type CelebrationVariant = "celebration" | "milestone" | "notice";

const VariantContext = createContext<CelebrationVariant>("celebration");

interface CelebrationProps {
  variant?: CelebrationVariant;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Celebration opens over the page after an action, with what the action did. The caller assembles
 * its title, figures and notes from the parts below; it closes with its one button.
 */
export function Celebration({ variant = "celebration", onClose, children }: CelebrationProps) {
  const notice = variant === "notice";
  return (
    <Dialog open onOpenChange={(open) => open || onClose()}>
      <DialogContent variant={notice ? "notice" : "celebration"} aria-describedby={undefined}>
        <VariantContext value={variant}>{children}</VariantContext>
        <DialogFooter>
          <DialogClose asChild>
            <Button>{notice ? "Entendi" : "Continuar"}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * CelebrationTitle names what happened. A celebration's title comes under its icon, a party popper
 * unless the caller picks another, which a milestone's rings ripple out of.
 */
export function CelebrationTitle({
  icon: Icon = PartyPopperIcon,
  ...props
}: React.ComponentProps<typeof DialogTitle> & { icon?: LucideIcon }) {
  const variant = use(VariantContext);
  return (
    <div className="flex flex-col items-center gap-4">
      {variant !== "notice" && (
        <span
          aria-hidden="true"
          className="relative flex size-16 items-center justify-center rounded-full bg-accent-tint text-accent fill-mode-both motion-safe:animate-in motion-safe:zoom-in-0 motion-safe:spin-in-90 motion-safe:delay-300 motion-safe:duration-700 motion-safe:ease-spring"
        >
          {variant === "milestone" && (
            <span className="absolute inset-0 -z-10 rounded-full bg-accent-soft motion-safe:animate-ripple" />
          )}
          <Icon className="size-8" strokeWidth={1.5} />
        </span>
      )}
      <DialogTitle {...props} />
    </div>
  );
}

/** CelebrationFigure is the action's main figure as a hero, between a lead and what it measures. */
export function CelebrationFigure({
  lead,
  unit,
  className,
  children,
  ...props
}: React.ComponentProps<"p"> & { lead: string; unit?: string }) {
  return (
    <p className={cn("flex flex-col items-center gap-1", className)} {...props}>
      <span className="text-footnote tracking-wide text-muted-foreground uppercase">{lead}</span>{" "}
      <span className="text-hero-figure text-positive">{children}</span>
      {unit && <span className="text-callout text-muted-foreground"> {unit}</span>}
    </p>
  );
}

/** CelebrationFacts lists the action's other figures, one per row, name left and value right. */
export function CelebrationFacts({ className, ...props }: React.ComponentProps<"dl">) {
  return (
    <dl
      className={cn("flex flex-col divide-y rounded-lg border bg-card text-left", className)}
      {...props}
    />
  );
}

export function CelebrationFact({
  name,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { name: string }) {
  return (
    <div
      className={cn("flex min-h-13 items-center justify-between gap-4 px-4 py-3", className)}
      {...props}
    >
      <dt className="text-callout whitespace-nowrap text-muted-foreground">{name}</dt>
      <dd className="text-right text-headline">{children}</dd>
    </div>
  );
}

/** CelebrationChange writes a value before and after the action. */
export function CelebrationChange({ from, to }: { from: string; to: string }) {
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-x-1.5">
      <span className="font-normal text-muted-foreground">{from}</span>{" "}
      <ArrowRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
      <span className="sr-only">para</span> <span>{to}</span>
    </span>
  );
}

/** CelebrationNote is a line of context under the figures. */
export function CelebrationNote({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-callout text-muted-foreground", className)} {...props} />;
}
