import { type ReactNode, useEffect, useRef } from "react";
import { Wordmark } from "@/components/layout/Wordmark";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { FormValues } from "@/lib/mortgageForm";
import { STEP_COUNT } from "@/lib/onboarding";

/** What every numbered step reads and changes of the mortgage being set up. */
export interface StepProps {
  values: FormValues;
  set: <K extends keyof FormValues>(key: K, value: FormValues[K]) => void;
  /** The message for the first of these locations the API rejected, as "contract_rates[1].rate". */
  messageOf: (...locations: string[]) => string | undefined;
}

interface StepFrameProps {
  step: number;
  title: string;
  context: string;
  onContinue: () => void;
  onBack: () => void;
  continueLabel?: string;
  pending?: boolean;
  /** Why the last attempt to go on failed, shown on the step that has to change. */
  alert?: ReactNode;
  children: ReactNode;
}

/** StepFrame is a numbered step of the onboarding: a question, its context and the inputs. */
export function StepFrame({
  step,
  title,
  context,
  onContinue,
  onBack,
  continueLabel = "Continuar",
  pending = false,
  alert,
  children,
}: StepFrameProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  return (
    <div className="min-h-svh">
      <Progress
        aria-label="Progresso da configuração"
        value={step}
        max={STEP_COUNT}
        className="fixed inset-x-0 top-0"
      />
      <header className="flex items-center justify-between px-10 pt-8">
        <Wordmark />
        <p className="text-footnote text-muted-foreground">
          Passo {step} de {STEP_COUNT}
        </p>
      </header>
      <main className="mx-auto w-full max-w-140 px-4 pt-14 pb-16">
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            onContinue();
          }}
          className="flex flex-col gap-6"
        >
          <div className="flex flex-col gap-2">
            <h1 ref={heading} tabIndex={-1} className="text-large-title outline-none">
              {title}
            </h1>
            <p className="text-muted-foreground">{context}</p>
          </div>
          {alert}
          {children}
          <div className="mt-4 flex flex-col items-center gap-3">
            <Button type="submit" disabled={pending} className="w-full">
              {continueLabel}
            </Button>
            <Button type="button" variant="plain" onClick={onBack}>
              Voltar
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
