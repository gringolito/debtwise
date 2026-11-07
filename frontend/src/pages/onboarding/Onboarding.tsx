import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api";
import { invalidLocations, withFirstChargeRates } from "@/lib/mortgageForm";
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
  const preview = usePreviewSchedule();
  const save = useSaveMortgage();
  const navigate = useNavigate();

  const invalid = invalidLocations(failure?.error ?? null);
  const isInvalid = (...locations: string[]) => locations.some((l) => invalid.has(l));

  const set: StepProps["set"] = (key, value) => {
    // The API names rows by position, so once a row is added or removed its answer is out of date.
    if (Array.isArray(value) && value.length !== (values[key] as unknown[]).length) {
      setFailure(null);
    }
    setValues((current) => withFirstChargeRates(current, { ...current, [key]: value }));
  };

  const fail = (error: Error, at: number, action: Failure["action"]) => {
    const owner =
      error instanceof ApiError && error.status === 422
        ? stepOf(invalidLocations(error))
        : undefined;
    setFailure({ error, step: owner ?? at, action });
    setStep(owner ?? at);
  };

  const review = () =>
    preview.mutate(onboardingTerms(values), {
      onSuccess: () => {
        setFailure(null);
        setStep(REVIEW_STEP);
      },
      onError: (error) => fail(error, LAST_TERMS_STEP, "preview"),
    });

  // Saving registers the mortgage, which swaps the onboarding for the app at once, so the address
  // moves to Início first: the app then opens there instead of on the page the owner came in on.
  const finish = () => {
    void navigate({ to: "/" });
    save.mutate(onboardingTerms(values), {
      onError: (error) => fail(error, REVIEW_STEP, "save"),
    });
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
          onEdit={() => setStep(1)}
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
      pending={step === LAST_TERMS_STEP && preview.isPending}
      onContinue={step === LAST_TERMS_STEP ? review : () => setStep(step + 1)}
      onBack={() => setStep(step - 1)}
      alert={alert}
    >
      <Fields values={values} set={set} isInvalid={isInvalid} />
    </StepFrame>
  );
}
