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

const rowsOf = (list: HTMLElement) => within(list).getAllByRole("link").map(words);
const comprasList = () => screen.findByRole("region", { name: "Compras" });
const marketValue = {
  gross: "34800.12",
  iof: "70.50",
  income_tax: "1700.00",
  custody_fee: "13.12",
  net: "33016.50",
};
const sellingAll = [ipca2035, ipca2035Again, prefixado2029];

describe("Investimentos", () => {
  it("shows the net Market Value with the gross and what the deductions took off it, and lists every lot in one list, the bonds maturing first leading", async () => {
    stubInvestments({
      lots: [ipca2035, prefixado2029, ipca2035Again],
      marketValue,
    });
    renderAt("/investimentos");

    const total = await screen.findByRole("region", { name: "Valor de mercado" });
    expect(words(total)).toBe(
      "Valor de mercado R$ 33.016,50 Líquido, se vender tudo hoje Bruto R$ 34.800,12 Descontos R$ 1.700,00 de IR, R$ 70,50 de IOF e R$ 13,12 de custódia 1 compra sem valor de mercado ficou fora do total.",
    );

    expect(screen.queryByRole("heading", { name: /^Tesouro/ })).toBeNull();
    expect(rowsOf(await comprasList())).toEqual([
      "Tesouro Prefixado com Juros Semestrais 2029 Sem preço de venda Compra em 10/01/2025 · 11,85%",
      "Tesouro IPCA+ 2035 R$ 18.204,10 Compra em 12/05/2024 · IPCA + 6,21%",
      "Tesouro IPCA+ 2035 R$ 14.812,40 Compra em 18/11/2024 · IPCA + 6,45%",
    ]);
  });

  it.each([
    [{ iof: "0.00" }, "R$ 1.700,00 de IR e R$ 13,12 de custódia"],
    [{ iof: "0.00", income_tax: "0.00", custody_fee: "0.00" }, "Nenhum"],
  ])("names only the deductions that took something off the gross, %j", async (zeroed, taken) => {
    stubInvestments({ lots: [ipca2035], marketValue: { ...marketValue, ...zeroed } });
    renderAt("/investimentos");

    const total = await screen.findByRole("region", { name: "Valor de mercado" });
    expect(within(total).getByText("Descontos").nextElementSibling).toHaveTextContent(taken);
  });

  it("says under each lot whether selling it early beats holding it, with a gain in green", async () => {
    stubInvestments({
      lots: [ipca2035, ipca2035Again],
      checks: [checkFor(ipca2035Again, "-120.00"), checkFor(ipca2035, "2140.00")],
    });
    renderAt("/investimentos");

    const list = await comprasList();
    await waitFor(() =>
      expect(rowsOf(list)).toEqual([
        "Tesouro IPCA+ 2035 R$ 18.204,10 Compra em 12/05/2024 · IPCA + 6,21% Manter até o vencimento",
        "Tesouro IPCA+ 2035 R$ 14.812,40 Compra em 18/11/2024 · IPCA + 6,45% Vender e amortizar vale mais a pena: R$ 120,00 de diferença a favor",
      ]),
    );
    expect(within(list).getByText("R$ 120,00")).toHaveClass("text-positive");
  });

  it("says under the total how many purchases would earn more sold", async () => {
    stubInvestments({
      lots: sellingAll,
      marketValue,
      checks: sellingAll.map((lot) => checkFor(lot, "-120.00")),
    });
    renderAt("/investimentos");

    expect(
      await screen.findByText("3 compras valeriam mais a pena vendidas para amortizar."),
    ).toBeVisible();
  });

  it("says it in the singular for one purchase", async () => {
    stubInvestments({
      lots: [ipca2035, ipca2035Again],
      marketValue,
      checks: [checkFor(ipca2035Again, "-120.00"), checkFor(ipca2035, "2140.00")],
    });
    renderAt("/investimentos");

    expect(
      await screen.findByText("1 compra valeria mais a pena vendida para amortizar."),
    ).toBeVisible();
  });

  it("says nothing of selling when no purchase would earn more sold", async () => {
    stubInvestments({
      lots: [ipca2035],
      marketValue,
      checks: [checkFor(ipca2035, "2140.00")],
    });
    renderAt("/investimentos");

    await screen.findByText("Manter até o vencimento");
    expect(screen.queryByText(/valeria/)).toBeNull();
  });

  it("notes stale market data that any lot's early sale check reads, not only the first", async () => {
    const prefixado = checkFor(prefixado2029, "-55.00");
    const ipca = checkFor(ipca2035, "2140.00");
    stubInvestments({
      lots: [ipca2035, prefixado2029],
      checks: [
        { ...prefixado, market_data: { ...prefixado.market_data, indexes: [] } },
        {
          ...ipca,
          market_data: {
            ...ipca.market_data,
            indexes: [{ index: "ipca", status: "stale", refreshed_at: "2026-11-01T12:00:00Z" }],
          },
        },
      ],
    });
    renderAt("/investimentos");

    expect(await screen.findByText("IPCA de 01/11.")).toBeInTheDocument();
  });

  it("keeps the lots listed when the early sale checks fail, and compares again", async () => {
    let fail = true;
    stubInvestments({
      lots: [ipca2035],
      routes: {
        "GET /api/early-sale-checks": () =>
          fail
            ? problem(500, "Internal Server Error", "boom")
            : Response.json({
                date: "2026-11-06",
                effect: "shorten_term",
                checks: [checkFor(ipca2035, "2140.00")],
              }),
      },
    });
    renderAt("/investimentos");

    const error = await screen.findByRole("alert");
    expect(
      within(error).getByText("Não foi possível comparar a venda das suas compras."),
    ).toBeVisible();
    expect(rowsOf(await comprasList())).toEqual([
      "Tesouro IPCA+ 2035 R$ 18.204,10 Compra em 12/05/2024 · IPCA + 6,21%",
    ]);

    fail = false;
    fireEvent.click(within(error).getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByText("Manter até o vencimento")).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says a lot waits on the IPCA instead of showing a value", async () => {
    stubInvestments({ lots: [waitingOnIpca] });
    renderAt("/investimentos");

    expect(rowsOf(await comprasList())).toEqual([
      "Tesouro IPCA+ 2045 Aguardando o IPCA Compra em 01/06/2026 · IPCA + 6,88%",
    ]);
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
    type("Data da compra", "10/01/2025");
    type("Taxa", "11,85");
    type("Preço unitário", "702,15");
    type("Quantidade", "20");
    fireEvent.click(within(sheet).getByRole("button", { name: "Adicionar" }));

    const celebration = await screen.findByRole("dialog", { name: "Compra registrada!" });
    expect(screen.queryByRole("form")).toBeNull();
    fireEvent.click(within(celebration).getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const list = await comprasList();
    await waitFor(() =>
      expect(rowsOf(list)).toEqual([
        "Tesouro Prefixado 2029 Sem preço de venda Compra em 10/01/2025 · 11,85% Vender e amortizar vale mais a pena: R$ 55,00 de diferença a favor",
        "Tesouro IPCA+ 2035 R$ 18.204,10 Compra em 12/05/2024 · IPCA + 6,21% Manter até o vencimento",
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

    expect(await comprasList()).toBeInTheDocument();
  });
});
