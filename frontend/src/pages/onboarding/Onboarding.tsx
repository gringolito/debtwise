import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api";
import { checkStep, type FieldErrors, staleLocations, withoutStale } from "@/lib/onboardingChecks";
import { rejections, withFirstChargeRates } from "@/lib/mortgageForm";
import { usePreviewSchedule, useSaveMortgage } from "@/lib/mortgageQueries";
import {
  LAST_TERMS_STEP,
  onboardingTerms,
  onboardingValues,
  REVIEW_STEP,
  stepOf,
} from "@/lib/onboarding";
import { ContractStep } from "@/pages/onboarding/ContractStep";
import { IndexerStep } from "@/pages/onboarding/IndexerStep";
import { InsuranceStep } from "@/pages/onboarding/InsuranceStep";
import { InterestStep } from "@/pages/onboarding/InterestStep";
import { ReviewStep } from "@/pages/onboarding/ReviewStep";
import { StepFrame, type StepProps } from "@/pages/onboarding/StepFrame";
import { SystemStep } from "@/pages/onboarding/SystemStep";
import { Welcome } from "@/pages/onboarding/Welcome";

interface Failure {
  error: Error;
  /** The step that shows it: the first that asks for a field the API rejected. */
  step: number;
  action: "preview" | "save";
  /** What the API rejected and the owner has not changed since, by location. */
  rejected: FieldErrors;
}

const noErrors: FieldErrors = new Map();

/** Moves focus to the first field the step marks invalid: a choice's first radio, for a choice. */
function focusFirstInvalid() {
  const first = document.querySelector<HTMLElement>('main [aria-invalid="true"]');
  const target = first?.matches('[role="radiogroup"]')
    ? first.querySelector<HTMLElement>('[role="radio"]')
    : first;
  target?.focus();
}

const failureMessages: Record<Failure["action"], string> = {
  preview: "Não foi possível calcular o financiamento. Tente novamente.",
  save: "Não foi possível salvar o financiamento. Tente novamente.",
};

function FailureAlert({ failure }: { failure: Failure }) {
  const rejected = failure.error instanceof ApiError && failure.error.status === 422;
  return (
    <Alert variant="destructive">
      <AlertDescription>
        {rejected ? "Confira os campos destacados." : failureMessages[failure.action]}
      </AlertDescription>
    </Alert>
  );
}

const steps = [
  {
    title: "Vamos começar pelo contrato.",
    context: "Esses dados estão na primeira página do seu contrato.",
    Fields: ContractStep,
  },
  {
    title: "Como suas prestações são calculadas?",
    context: "Procure por “Sistema de amortização” no seu contrato.",
    Fields: SystemStep,
  },
  {
    title: "Seu saldo é corrigido por algum índice?",
    context: "Antes dos juros, o banco pode corrigir o saldo devedor todo mês.",
    Fields: IndexerStep,
  },
  {
    title: "Qual é a taxa de juros?",
    context: "A taxa anual cobrada sobre o saldo devedor, além da correção.",
    Fields: InterestStep,
  },
  {
    title: "Seguros e taxas",
    context: "Todo financiamento cobra dois seguros e, às vezes, uma taxa mensal.",
    Fields: InsuranceStep,
  },
] satisfies { title: string; context: string; Fields: React.ComponentType<StepProps> }[];

/**
 * Onboarding walks a first-time owner through setting up the mortgage: a welcome, five steps
 * that ask for the terms and a review of the schedule they give, which saves them.
 */
export function Onboarding() {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState(onboardingValues);
  const [failure, setFailure] = useState<Failure | null>(null);
  // What the browser found wrong with the step the owner tried to leave.
  const [checked, setChecked] = useState(noErrors);
  // A step opened from the review goes back to it, previewing the changed terms again.
  const [fromReview, setFromReview] = useState(false);
  const [focusRequests, setFocusRequests] = useState(0);
  const preview = usePreviewSchedule();
  const save = useSaveMortgage();
  const navigate = useNavigate();

  // Runs after the step that shows the messages has rendered.
  useEffect(() => {
    if (focusRequests > 0) focusFirstInvalid();
  }, [focusRequests]);

  const messageOf = (...locations: string[]) =>
    locations
      .map((location) => checked.get(location) ?? failure?.rejected.get(location))
      .find((message) => message !== undefined);

  // A message stops showing the moment its field changes, whoever found it wrong.
  const set: StepProps["set"] = (key, value) => {
    const next = withFirstChargeRates(values, { ...values, [key]: value });
    const stale = staleLocations(values, next);
    setValues(next);
    setChecked((current) => withoutStale(current, stale));
    setFailure((current) => {
      if (current === null) return current;
      const rejected = withoutStale(current.rejected, stale);
      if (rejected === current.rejected) return current;
      return rejected.size === 0 ? null : { ...current, rejected };
    });
  };

  const goTo = (target: number) => {
    setChecked(noErrors);
    setStep(target);
  };

  const fail = (error: Error, at: number, action: Failure["action"]) => {
    const rejected = rejections(error);
    const owner =
      error instanceof ApiError && error.status === 422 ? stepOf(rejected.keys()) : undefined;
    setFailure({ error, step: owner ?? at, action, rejected });
    goTo(owner ?? at);
    setFocusRequests((count) => count + 1);
  };

  const review = (from: number) =>
    preview.mutate(onboardingTerms(values), {
      onSuccess: () => {
        setFailure(null);
        setFromReview(false);
        goTo(REVIEW_STEP);
      },
      onError: (error) => fail(error, from, "preview"),
    });

  // Saving registers the mortgage, which swaps the onboarding for the app at once, so the address
  // moves to Início first: the app then opens there instead of on the page the owner came in on.
  const finish = () => {
    void navigate({ to: "/" });
    save.mutate(onboardingTerms(values), {
      onError: (error) => fail(error, REVIEW_STEP, "save"),
    });
  };

  // The browser checks what it can before a step goes on; the API stays the final authority at
  // the review.
  const proceed = () => {
    const errors = checkStep(step, values);
    setChecked(errors);
    if (errors.size > 0) setFocusRequests((count) => count + 1);
    else if (fromReview || step === LAST_TERMS_STEP) review(step);
    else goTo(step + 1);
  };

  // Going back is always one step back, even after a step was opened from the review: the review
  // would show new terms beside the schedule of the old ones.
  const back = () => {
    if (step === 1) setFromReview(false);
    goTo(step - 1);
  };

  const alert = failure?.step === step ? <FailureAlert failure={failure} /> : undefined;

  if (step === 0) return <Welcome onStart={() => setStep(1)} />;

  if (step === REVIEW_STEP && preview.data) {
    return (
      <StepFrame
        key={step}
        step={step}
        title="Tudo pronto."
        context="Confira o resumo. Você pode editar tudo depois."
        continueLabel="Concluir"
        pending={save.isPending}
        onContinue={finish}
        onBack={() => setStep(LAST_TERMS_STEP)}
        alert={alert}
      >
        <ReviewStep
          terms={onboardingTerms(values)}
          schedule={preview.data}
          onEditStep={(target) => {
            setFromReview(true);
            setStep(target);
          }}
        />
      </StepFrame>
    );
  }

  const { title, context, Fields } = steps[Math.min(step, LAST_TERMS_STEP) - 1];
  return (
    <StepFrame
      key={step}
      step={step}
      title={title}
      context={context}
      pending={(step === LAST_TERMS_STEP || fromReview) && preview.isPending}
      onContinue={proceed}
      onBack={back}
      alert={alert}
    >
      <Fields values={values} set={set} messageOf={messageOf} />
    </StepFrame>
  );
}
