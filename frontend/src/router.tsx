import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  type Router,
  type RouterHistory,
} from "@tanstack/react-router";
import { Bonds } from "@/pages/Bonds";
import { Decision } from "@/pages/Decision";
import { EarlySale } from "@/pages/EarlySale";
import { Home } from "@/pages/Home";
import { Indexes } from "@/pages/Indexes";
import { Lots } from "@/pages/Lots";
import { Mortgage } from "@/pages/Mortgage";
import { MortgageForm } from "@/pages/MortgageForm";

const rootRoute = createRootRoute({
  component: () => (
    <div className="mx-auto flex min-h-svh max-w-screen-lg flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">DebtWise</h1>
        <nav className="flex gap-4 text-sm">
          <Link to="/" className="text-muted-foreground [&.active]:text-foreground">
            Início
          </Link>
          <Link to="/indices" className="text-muted-foreground [&.active]:text-foreground">
            Índices
          </Link>
          <Link to="/titulos" className="text-muted-foreground [&.active]:text-foreground">
            Títulos
          </Link>
          <Link to="/lotes" className="text-muted-foreground [&.active]:text-foreground">
            Lotes
          </Link>
          <Link to="/decisao" className="text-muted-foreground [&.active]:text-foreground">
            Decisão
          </Link>
          <Link to="/venda-antecipada" className="text-muted-foreground [&.active]:text-foreground">
            Venda antecipada
          </Link>
          <Link to="/financiamento" className="text-muted-foreground [&.active]:text-foreground">
            Financiamento
          </Link>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  ),
  notFoundComponent: () => <p>Página não encontrada.</p>,
});

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home });
const indexesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/indices",
  component: Indexes,
});

const bondsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/titulos",
  component: Bonds,
});

const lotsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/lotes",
  component: Lots,
});

const decisionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/decisao",
  component: Decision,
});

const earlySaleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/venda-antecipada",
  component: EarlySale,
});

const mortgageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/financiamento",
  component: Mortgage,
});

const mortgageFormRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/financiamento/editar",
  component: MortgageForm,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  indexesRoute,
  bondsRoute,
  lotsRoute,
  decisionRoute,
  earlySaleRoute,
  mortgageRoute,
  mortgageFormRoute,
]);

export type AppRouter = Router<typeof routeTree>;

/** createAppRouter takes the history tests pass in; the browser uses the default one. */
export function createAppRouter(history?: RouterHistory): AppRouter {
  return createRouter({ routeTree, history });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
