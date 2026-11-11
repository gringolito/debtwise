import { ArrowRightIcon, type LucideIcon } from "lucide-react";
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
 * A notice informs after a correction.
 */
type CelebrationVariant = "celebration" | "milestone" | "notice";

const VariantContext = createContext<CelebrationVariant>("celebration");

interface CelebrationProps {
  variant?: CelebrationVariant;
  /** Fine print under the button, such as what a figure's asterisk stands for. */
  footnote?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Celebration takes a sheet's place once its action is saved, with what the action did. The modal
 * itself stays still; a celebration's motion is in its icon. The caller assembles its title,
 * figures and notes from the parts below; it closes with its one button.
 */
export function Celebration({
  variant = "celebration",
  footnote,
  onClose,
  children,
}: CelebrationProps) {
  return (
    <Dialog open onOpenChange={(open) => open || onClose()}>
      <DialogContent variant="feedback" aria-describedby={undefined}>
        <VariantContext value={variant}>{children}</VariantContext>
        <DialogFooter>
          <DialogClose asChild>
            <Button>{variant === "notice" ? "Entendi" : "Continuar"}</Button>
          </DialogClose>
          {footnote && <p className="text-right text-footnote text-muted-foreground">{footnote}</p>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The check draws its ring, then its tick. Without motion, both stand drawn.
function DrawnCheck() {
  return (
    <svg viewBox="0 0 96 96" className="size-full motion-safe:animate-pop" fill="none">
      <circle cx="48" cy="48" r="46" className="fill-accent-tint" />
      <circle
        cx="48"
        cy="48"
        r="44"
        transform="rotate(-90 48 48)"
        pathLength={1}
        strokeDasharray={1}
        strokeWidth={4}
        className="stroke-accent-soft motion-safe:animate-draw-ring"
      />
      <path
        d="M29 49.5 42 62l25-27"
        pathLength={1}
        strokeDasharray={1}
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-accent motion-safe:animate-draw-check"
      />
    </svg>
  );
}

/**
 * CelebrationTitle names what happened. A celebration's title comes under a check that draws
 * itself, or under the icon the caller picks, which pops in and twists. A milestone's rings ripple
 * out of it. A notice has no icon.
 */
export function CelebrationTitle({
  icon: Icon,
  ...props
}: React.ComponentProps<typeof DialogTitle> & { icon?: LucideIcon }) {
  const variant = use(VariantContext);
  return (
    <div className="flex flex-col items-center gap-6">
      {variant !== "notice" && (
        <span aria-hidden="true" className="relative size-40">
          {variant === "milestone" && (
            <span className="absolute inset-0 rounded-full bg-accent-soft motion-safe:animate-ripple" />
          )}
          {Icon ? (
            <span className="relative flex size-full items-center justify-center rounded-full bg-accent-tint text-accent motion-safe:animate-pop">
              <Icon className="size-20 motion-safe:animate-twist" strokeWidth={1.5} />
            </span>
          ) : (
            <span className="relative block size-full">
              <DrawnCheck />
            </span>
          )}
        </span>
      )}
      <DialogTitle {...props} />
    </div>
  );
}

/**
 * CelebrationFigure is the action's main figure as a hero, between a lead and what it measures. It
 * is green when it is money gained; `gain={false}` keeps any other figure, such as an amount
 * invested, in the text color.
 */
export function CelebrationFigure({
  lead,
  unit,
  gain = true,
  className,
  children,
  ...props
}: React.ComponentProps<"p"> & { lead: string; unit?: string; gain?: boolean }) {
  return (
    <p className={cn("flex flex-col items-center gap-1", className)} {...props}>
      <span className="text-footnote tracking-wide text-muted-foreground uppercase">{lead}</span>{" "}
      <span className={cn("relative text-hero-figure", gain && "text-positive")}>{children}</span>
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

/**
 * CelebrationMark is the small mark beside a figure that the footnote explains, such as "*". It
 * hangs outside the figure, so the figure stays centered.
 */
export function CelebrationMark({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "absolute top-0 left-full ml-1 text-title-2 font-normal text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
