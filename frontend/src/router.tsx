import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  type Router,
  type RouterHistory,
} from "@tanstack/react-router";
import { Home } from "@/pages/Home";

const rootRoute = createRootRoute({
  component: () => (
    <div className="mx-auto flex min-h-svh max-w-screen-lg flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">DebtWise</h1>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  ),
  notFoundComponent: () => <p>Página não encontrada.</p>,
});

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home });

const routeTree = rootRoute.addChildren([homeRoute]);

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
