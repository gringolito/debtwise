import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { MortgageWelcome } from "@/components/mortgage/MortgageWelcome";
import { ErrorPanel } from "@/components/patterns/ErrorPanel";
import { Loading } from "@/components/patterns/Loading";
import { useMortgage } from "@/lib/mortgageQueries";
import { Onboarding } from "@/pages/onboarding/Onboarding";
import { DashboardSkeleton } from "@/pages/dashboard/DashboardSkeleton";
import { ProtoShell } from "@/prototypes/ProtoShell";
import { usePrototypeVariant } from "@/prototypes/variant";

/**
 * MortgageGate opens the app once a mortgage is registered and, until then, the onboarding that
 * sets one up, whatever address the owner opened. A mortgage registered while the onboarding was
 * open is welcomed over the app.
 */
export function MortgageGate() {
  const { data, isError, refetch } = useMortgage();
  const variant = usePrototypeVariant();
  const [onboarding, setOnboarding] = useState(false);
  const [welcoming, setWelcoming] = useState(false);

  if (data === null && !onboarding) setOnboarding(true);
  if (data && onboarding) {
    setOnboarding(false);
    setWelcoming(true);
  }

  if (data === null) return <Onboarding />;
  if (data) {
    return (
      <>
        <AppShell />
        {welcoming && <MortgageWelcome onClose={() => setWelcoming(false)} />}
      </>
    );
  }
  if (isError) {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-140 flex-col justify-center px-4">
        <ErrorPanel title="Não foi possível carregar seu financiamento" onRetry={() => refetch()} />
      </main>
    );
  }
  if (variant !== "A") {
    return (
      <ProtoShell>
        <DashboardSkeleton />
      </ProtoShell>
    );
  }
  return <Loading label="Carregando" className="min-h-svh" />;
}
