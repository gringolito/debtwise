import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { words } from "@/test/dom";
import {
  checkFor,
  ipca2035,
  ipca2035Again,
  prefixado2029,
  stubInvestments,
  waitingOnIpca,
} from "@/test/lotFixtures";
import { renderAt } from "@/test/renderAt";
import { problem } from "@/test/stubServer";

afterEach(() => {
  vi.unstubAllGlobals();
});

const rowsOf = (group: HTMLElement) => within(group).getAllByRole("link").map(words);

describe("Compras", () => {
  it("shows the net Market Value with what it took off the gross, and lists each lot under its bond", async () => {
    stubInvestments({
      lots: [ipca2035, prefixado2029, ipca2035Again],
      marketValue: { gross: "34800.12", net: "33016.50" },
    });
    renderAt("/investimentos");

    const total = await screen.findByRole("region", { name: "Valor de mercado" });
    expect(words(total)).toBe(
      "Valor de mercado R$ 33.016,50 Líquido, se vender tudo hoje Bruto R$ 34.800,12 IR, IOF e custódia − R$ 1.783,62 1 compra sem valor de mercado ficou fora do total.",
    );

    const groups = screen.getAllByRole("region").filter((region) => region !== total);
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual([
      "Tesouro Prefixado com Juros Semestrais 2029",
      "Tesouro IPCA+ 2035",
    ]);
    expect(rowsOf(groups[0])).toEqual(["Compra em 10/01/2025 · 11,85% Sem preço de venda"]);
    expect(rowsOf(groups[1])).toEqual([
      "Compra em 12/05/2024 · IPCA + 6,21% R$ 18.204,10",
      "Compra em 18/11/2024 · IPCA + 6,45% R$ 14.812,40",
    ]);
  });

  it("says under each lot what its early sale check favours, with a gain in green", async () => {
    stubInvestments({
      lots: [ipca2035, ipca2035Again],
      checks: [checkFor(ipca2035Again, "-120.00"), checkFor(ipca2035, "2140.00")],
    });
    renderAt("/investimentos");

    const group = await screen.findByRole("region", { name: "Tesouro IPCA+ 2035" });
    await waitFor(() =>
      expect(rowsOf(group)).toEqual([
        "Compra em 12/05/2024 · IPCA + 6,21% Manter até o vencimento R$ 18.204,10",
        "Compra em 18/11/2024 · IPCA + 6,45% Vender e amortizar renderia + R$ 120,00 R$ 14.812,40",
      ]),
    );
    expect(within(group).getByText("+ R$ 120,00")).toHaveClass("text-positive");
  });

  it("says a lot waits on the IPCA instead of showing a value", async () => {
    stubInvestments({ lots: [waitingOnIpca] });
    renderAt("/investimentos");

    const group = await screen.findByRole("region", { name: "Tesouro IPCA+ 2045" });
    expect(rowsOf(group)).toEqual(["Compra em 01/06/2026 · IPCA + 6,88% Aguardando o IPCA"]);
    expect(screen.getByText("Nenhuma compra tem valor de mercado hoje.")).toBeInTheDocument();
  });

  it("opens a lot's detail from its row", async () => {
    stubInvestments({ lots: [ipca2035] });
    renderAt("/investimentos");

    fireEvent.click(await screen.findByRole("link", { name: /Compra em 12\/05\/2024/ }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Tesouro IPCA+ 2035" }),
    ).toBeInTheDocument();
  });

  it("offers to add or import the first purchase when there is none", async () => {
    stubInvestments({ lots: [] });
    renderAt("/investimentos");

    const empty = await screen.findByRole("region", { name: "Nenhuma compra" });
    expect(
      within(empty).getByRole("heading", { name: "Nenhum título por aqui ainda" }),
    ).toBeVisible();
    expect(screen.queryByRole("group", { name: "Investimentos" })).toBeNull();

    fireEvent.click(within(empty).getByRole("link", { name: "Importar planilha" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Importar planilha" }),
    ).toBeInTheDocument();
  });

  it("adds a purchase in a sheet and lists it with its early sale check", async () => {
    let lots = [ipca2035];
    stubInvestments({
      lots,
      routes: {
        "GET /api/lots": () => Response.json({ lots }),
        "GET /api/bonds": () =>
          Response.json({
            bonds: [
              {
                type: "ltn",
                maturity: "2029-01-01",
                sell: { rate: "0.131", unit_price: "760.00" },
                fetched_at: "2026-11-06T18:24:00Z",
              },
            ],
          }),
        "POST /api/lots/preview": () => Response.json({ cost: "14043.00" }),
        "POST /api/lots": () => {
          lots = [...lots, { ...prefixado2029, id: 3, type: "ltn" }];
          return Response.json(lots[1], { status: 201 });
        },
        "GET /api/early-sale-checks": () =>
          Response.json({
            date: "2026-11-06",
            effect: "shorten_term",
            checks: lots.map((lot) => checkFor(lot, lot.id === 3 ? "-55.00" : "2140.00")),
          }),
      },
    });
    renderAt("/investimentos");

    fireEvent.click(await screen.findByRole("button", { name: "Adicionar compra" }));
    const sheet = await screen.findByRole("form", { name: "Adicionar compra" });
    await within(sheet).findByRole("option", { name: "Tesouro Prefixado 2029" });
    const type = (label: string, value: string) =>
      fireEvent.change(within(sheet).getByLabelText(label), { target: { value } });
    type("Título", "ltn 2029-01-01");
    type("Data da compra", "2025-01-10");
    type("Taxa", "11,85");
    type("Preço unitário", "702,15");
    type("Quantidade", "20");
    fireEvent.click(within(sheet).getByRole("button", { name: "Adicionar" }));

    const group = await screen.findByRole("region", { name: "Tesouro Prefixado 2029" });
    await waitFor(() =>
      expect(rowsOf(group)).toEqual([
        "Compra em 10/01/2025 · 11,85% Vender e amortizar renderia + R$ 55,00 Sem preço de venda",
      ]),
    );
  });

  it("shows skeletons while the lots load, then an error panel that retries", async () => {
    let answer = () => {};
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    let fail = true;
    stubInvestments({
      lots: [ipca2035],
      routes: {
        "GET /api/lots": async () => {
          await answered;
          return fail
            ? problem(500, "Internal Server Error", "boom")
            : Response.json({ lots: [ipca2035] });
        },
      },
    });
    renderAt("/investimentos");

    expect(
      await screen.findByRole("status", { name: "Carregando investimentos" }),
    ).toBeInTheDocument();
    answer();
    const error = await screen.findByRole("alert");
    expect(within(error).getByText("Não foi possível carregar seus investimentos")).toBeVisible();

    fail = false;
    fireEvent.click(within(error).getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByRole("region", { name: "Tesouro IPCA+ 2035" })).toBeInTheDocument();
  });
});
