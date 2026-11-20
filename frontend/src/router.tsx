import {
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
  Outlet,
  type Router,
  type RouterHistory,
  redirect,
} from "@tanstack/react-router";
import { type EffectSearch, validateEffectSearch } from "@/lib/investments";
import { isIndexName } from "@/lib/marketIndexes";
import { Contract } from "@/pages/Contract";
import { Dashboard } from "@/pages/Dashboard";
import { Decision } from "@/pages/Decision";
import { ImportLots } from "@/pages/ImportLots";
import { Investments } from "@/pages/Investments";
import { LotDetail } from "@/pages/LotDetail";
import { Market } from "@/pages/Market";
import { Bonds } from "@/pages/market/Bonds";
import { IndexDetail } from "@/pages/market/IndexDetail";
import { Indexes } from "@/pages/market/Indexes";
import { Mortgage } from "@/pages/Mortgage";
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

/** Financiamento's sections other than Prestações, the one it opens on, by their address. */
export interface MortgageSearch {
  secao?: "amortizacoes" | "extratos";
}

const mortgageRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/financiamento",
  component: Mortgage,
  validateSearch: (search: Record<string, unknown>): MortgageSearch =>
    search.secao === "amortizacoes" || search.secao === "extratos" ? { secao: search.secao } : {},
});

const contractRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/financiamento/editar",
  component: Contract,
});

const investmentsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/investimentos",
  component: Investments,
});

/** Venda antecipada was a section of Investimentos; its old address leads to Investimentos. */
const oldEarlySaleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/investimentos/venda-antecipada",
  beforeLoad: () => {
    throw redirect({ to: "/investimentos", replace: true });
  },
});

const lotRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/investimentos/compras/$lotId",
  component: LotDetail,
  validateSearch: validateEffectSearch,
});

const importLotsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/investimentos/importar",
  component: ImportLots,
});

/**
 * What a link to Comparar can prefill: `valor`, the amount in reais, `efeito`, the effect as a
 * lot's address says it, and `comparar`, whether to run the comparison on arrival. Anything else in
 * the address is dropped. An amount written as decimal text, as Início links it, keeps every
 * centavo; a number is still read for older links.
 */
export interface DecisionSearch extends EffectSearch {
  valor?: number | string;
  comparar?: boolean;
}

const DECIMAL_AMOUNT = /^(0|[1-9][0-9]{0,14})(\.[0-9]{1,2})?$/;

function validAmount(valor: unknown): number | string | undefined {
  if (typeof valor === "number") return Number.isFinite(valor) && valor > 0 ? valor : undefined;
  if (typeof valor === "string" && DECIMAL_AMOUNT.test(valor) && Number(valor) > 0) return valor;
  return undefined;
}

function validateDecisionSearch(search: Record<string, unknown>): DecisionSearch {
  return {
    valor: validAmount(search.valor),
    ...validateEffectSearch(search),
    comparar: search.comparar === true ? true : undefined,
  };
}

const decisionRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/comparar",
  component: Decision,
  validateSearch: validateDecisionSearch,
});

/** Comparar was called Decidir; its old address, and the links to it, still lead there. */
const oldDecisionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/decidir",
  beforeLoad: ({ location }) => {
    throw redirect({
      to: "/comparar",
      search: validateDecisionSearch(location.search),
      replace: true,
    });
  },
});

const marketRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/mercado",
  component: Market,
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

const indexRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/mercado/indices/$index",
  component: IndexDetail,
  beforeLoad: ({ params }) => {
    if (!isIndexName(params.index)) throw notFound();
  },
});

const settingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/ajustes",
  component: Settings,
});

const routeTree = rootRoute.addChildren([
  oldDecisionRoute,
  oldEarlySaleRoute,
  shellRoute.addChildren([
    homeRoute,
    mortgageRoute,
    contractRoute,
    investmentsRoute,
    lotRoute,
    importLotsRoute,
    decisionRoute,
    marketRoute.addChildren([indexesRoute, bondsRoute]),
    indexRoute,
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
