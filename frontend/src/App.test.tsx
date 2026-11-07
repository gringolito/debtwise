import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    ["Financiamento", "/financiamento"],
    ["Investimentos", "/investimentos"],
    ["Decidir", "/decidir"],
    ["Mercado", "/mercado"],
    ["Ajustes", "/ajustes"],
  ];

  it.each([
    ["/", "Início"],
    ["/financiamento", "Financiamento"],
    ["/financiamento/editar", "Financiamento"],
    ["/investimentos", "Investimentos"],
    ["/investimentos/venda-antecipada", "Investimentos"],
    ["/investimentos/importar", "Investimentos"],
    ["/decidir", "Decidir"],
    ["/mercado", "Mercado"],
    ["/mercado/titulos", "Mercado"],
    ["/ajustes", "Ajustes"],
  ])("lists the six destinations and marks the current one on %s", async (path, current) => {
    stubRoutes({});

    renderAt(path);

    expect(await screen.findByText("DebtWise")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Principal" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual(
      destinations,
    );
    expect(
      links
        .filter((link) => link.getAttribute("aria-current") === "page")
        .map((link) => link.textContent),
    ).toEqual([current]);
  });

  it.each([
    ["/mercado/", "Índices"],
    ["/investimentos/", "Compras"],
  ])("selects the section %s opens, trailing slash and all", async (path, section) => {
    stubRoutes({});

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
