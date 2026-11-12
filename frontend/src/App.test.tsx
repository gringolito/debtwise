import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ipca2035 } from "./test/lotFixtures";
import { registeredMortgage } from "./test/mortgageFixtures";
import { renderAt } from "./test/renderAt";
import { stubRoutes, stubServer } from "./test/stubServer";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the API", () => {
  it("is called on the page's origin", async () => {
    const requests = stubRoutes({ "GET /api/mortgage": () => Response.json(registeredMortgage) });

    renderAt("/");

    // Same origin as the page: in the images Caddy proxies /api to the server.
    await waitFor(() =>
      expect(requests).toContainEqual({
        method: "GET",
        url: new URL("/api/mortgage", window.location.origin).href,
      }),
    );
  });
});

describe("shell", () => {
  const destinations = [
    ["Início", "/"],
    ["Comparar", "/comparar"],
    ["Financiamento", "/financiamento"],
    ["Investimentos", "/investimentos"],
    ["Mercado", "/mercado"],
    ["Ajustes", "/ajustes"],
  ];

  it.each([
    ["/", "Início"],
    ["/comparar", "Comparar"],
    ["/financiamento", "Financiamento"],
    ["/financiamento/editar", "Financiamento"],
    ["/investimentos", "Investimentos"],
    ["/investimentos/venda-antecipada", "Investimentos"],
    ["/investimentos/importar", "Investimentos"],
    ["/mercado", "Mercado"],
    ["/mercado/titulos", "Mercado"],
    ["/ajustes", "Ajustes"],
  ])(
    "lists the six destinations in the sidebar and the tab bar, marking the current one on %s",
    async (path, current) => {
      stubRoutes({});

      renderAt(path);

      expect(await screen.findByText("Debtwise")).toBeInTheDocument();
      const navs = screen.getAllByRole("navigation", { name: "Principal" });
      expect(navs).toHaveLength(2);
      for (const nav of navs) {
        expect(
          destinations.map(([name]) => [
            name,
            within(nav).getByRole("link", { name }).getAttribute("href"),
          ]),
        ).toEqual(destinations);
        expect(
          within(nav)
            .getAllByRole("link")
            .map((link) => link.getAttribute("href")),
        ).toEqual(destinations.map(([, href]) => href));
        expect(
          within(nav)
            .getAllByRole("link", { current: "page" })
            .map((link) => link.getAttribute("href")),
        ).toEqual([destinations.find(([name]) => name === current)?.[1]]);
      }
    },
  );

  it.each([
    ["/decidir", "/comparar"],
    ["/decidir?valor=10000&comparar=true", "/comparar?valor=10000&comparar=true"],
  ])("takes the old address %s to Comparar, search kept", async (path, address) => {
    stubRoutes({});

    const router = renderAt(path);

    expect(await screen.findByRole("heading", { name: "Comparar" })).toBeInTheDocument();
    expect(router.state.location.href).toBe(address);
  });

  it.each([
    ["/mercado/", "Índices"],
    ["/investimentos/", "Compras"],
  ])("selects the section %s opens, trailing slash and all", async (path, section) => {
    // Investimentos shows its sections once it has a lot to show in them.
    stubRoutes({ "GET /api/lots": () => Response.json({ lots: [ipca2035] }) });

    renderAt(path);

    expect(await screen.findByRole("radio", { name: section })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it.each(["/nao-existe", "/financiamento/nao-existe"])(
    "answers the unknown address %s with the page that leads home",
    async (path) => {
      stubServer(() => Response.json({ status: "ok" }));

      renderAt(path);

      expect(
        await screen.findByRole("heading", { name: "Esta página não existe" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Voltar ao início" })).toHaveAttribute("href", "/");
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    },
  );
});
