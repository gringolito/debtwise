import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  type Router,
  type RouterHistory,
} from "@tanstack/react-router";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { Bonds } from "@/pages/Bonds";
import { Dashboard } from "@/pages/Dashboard";
import { Decision } from "@/pages/Decision";
import { EarlySale } from "@/pages/EarlySale";
import { ImportLots } from "@/pages/ImportLots";
import { Indexes } from "@/pages/Indexes";
import { Lots } from "@/pages/Lots";
import { Mortgage } from "@/pages/Mortgage";
import { MortgageForm } from "@/pages/MortgageForm";
import { NotFound } from "@/pages/NotFound";
import { MortgageGate } from "@/pages/onboarding/MortgageGate";
import { Settings } from "@/pages/Settings";

const rootRoute = createRootRoute({ component: Outlet, notFoundComponent: NotFound });

const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "shell",
  component: MortgageGate,
});

const homeRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/",
  component: Dashboard,
});

const mortgageRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/financiamento",
  component: Mortgage,
});

const mortgageFormRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/financiamento/editar",
  component: MortgageForm,
});

const investmentsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/investimentos",
  component: () => (
    <SectionLayout
      label="Investimentos"
      sections={[
        { to: "/investimentos", label: "Compras" },
        { to: "/investimentos/venda-antecipada", label: "Venda antecipada" },
      ]}
    />
  ),
});

const lotsRoute = createRoute({
  getParentRoute: () => investmentsRoute,
  path: "/",
  component: Lots,
});

const earlySaleRoute = createRoute({
  getParentRoute: () => investmentsRoute,
  path: "/venda-antecipada",
  component: EarlySale,
});

const importLotsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/investimentos/importar",
  component: ImportLots,
});

/**
 * What a link to Decidir can prefill: `valor`, the amount in reais, and `comparar`, whether to run
 * the comparison on arrival. Anything else in the address is dropped.
 */
export interface DecisionSearch {
  valor?: number;
  comparar?: boolean;
}

const decisionRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/decidir",
  component: Decision,
  validateSearch: (search: Record<string, unknown>): DecisionSearch => ({
    valor:
      typeof search.valor === "number" && Number.isFinite(search.valor) && search.valor > 0
        ? search.valor
        : undefined,
    comparar: search.comparar === true ? true : undefined,
  }),
});

const marketRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/mercado",
  component: () => (
    <SectionLayout
      label="Mercado"
      sections={[
        { to: "/mercado", label: "Índices" },
        { to: "/mercado/titulos", label: "Títulos" },
      ]}
    />
  ),
});

const indexesRoute = createRoute({
  getParentRoute: () => marketRoute,
  path: "/",
  component: Indexes,
});

const bondsRoute = createRoute({
  getParentRoute: () => marketRoute,
  path: "/titulos",
  component: Bonds,
});

const settingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/ajustes",
  component: Settings,
});

const routeTree = rootRoute.addChildren([
  shellRoute.addChildren([
    homeRoute,
    mortgageRoute,
    mortgageFormRoute,
    investmentsRoute.addChildren([lotsRoute, earlySaleRoute]),
    importLotsRoute,
    decisionRoute,
    marketRoute.addChildren([indexesRoute, bondsRoute]),
    settingsRoute,
  ]),
]);

export type AppRouter = Router<typeof routeTree>;

/** createAppRouter takes the history tests pass in; the browser uses the default one. */
export function createAppRouter(history?: RouterHistory): AppRouter {
  return createRouter({ routeTree, history, notFoundMode: "root" });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
