import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { MortgageWelcome } from "@/components/mortgage/MortgageWelcome";
import { ErrorPanel } from "@/components/patterns/ErrorPanel";
import { useMortgage } from "@/lib/mortgageQueries";
import { DashboardSkeleton } from "@/pages/dashboard/DashboardSkeleton";
import { Onboarding } from "@/pages/onboarding/Onboarding";

/**
 * MortgageGate opens the app once a mortgage is registered and, until then, the onboarding that
 * sets one up, whatever address the owner opened. A mortgage registered while the onboarding was
 * open is welcomed over the app. While the mortgage loads, the shell shows Início's skeleton.
 */
export function MortgageGate() {
  const { data, isError, refetch } = useMortgage();
  const [onboarding, setOnboarding] = useState(false);
  const [welcoming, setWelcoming] = useState(false);

  if (data === null && !onboarding) setOnboarding(true);
  if (data && onboarding) {
    setOnboarding(false);
    setWelcoming(true);
  }

  if (data === null) return <Onboarding />;
  if (!data && isError) {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-140 flex-col justify-center px-4">
        <ErrorPanel title="Não foi possível carregar seu financiamento" onRetry={() => refetch()} />
      </main>
    );
  }
  // One shell for both states, so the page replaces the skeleton inside it.
  return (
    <>
      <AppShell>{data ? undefined : <DashboardSkeleton />}</AppShell>
      {welcoming && <MortgageWelcome onClose={() => setWelcoming(false)} />}
    </>
  );
}
