import { AppShell } from "@/components/layout/AppShell";
import { ErrorPanel } from "@/components/patterns/ErrorPanel";
import { Loading } from "@/components/patterns/Loading";
import { useMortgage } from "@/lib/mortgageQueries";
import { Onboarding } from "@/pages/onboarding/Onboarding";

/**
 * MortgageGate opens the app once a mortgage is registered and, until then, the onboarding that
 * sets one up, whatever address the owner opened.
 */
export function MortgageGate() {
  const { data, isError, refetch } = useMortgage();

  if (data === null) return <Onboarding />;
  if (data) return <AppShell />;
  if (isError) {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-140 flex-col justify-center px-4">
        <ErrorPanel title="Não foi possível carregar seu financiamento" onRetry={() => refetch()} />
      </main>
    );
  }
  return <Loading label="Carregando" className="min-h-svh" />;
}
