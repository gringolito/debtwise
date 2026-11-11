import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LotAmount, LotInput, Scenario } from "@/lib/api";
import { rowTexts, text, words } from "@/test/dom";
import {
  checkFor,
  ipca2035,
  prefixado2029,
  stubInvestments,
  uncheckable,
  waitingOnIpca,
} from "@/test/lotFixtures";
import { renderAt } from "@/test/renderAt";

afterEach(() => {
  vi.unstubAllGlobals();
});

const earlySale = () => screen.findByRole("region", { name: "Venda antecipada" });
const figures = () =>
  screen.getAllByRole("term").map((term) => words(term.parentElement as HTMLElement));

const quiet = { invested: "0.00", prepaid: "0.00", held: "0.00" };
const maturityValue = ipca2035.values?.maturity as LotAmount;
const hold: Scenario = {
  net_worth: "41380.00",
  cash: "0.00",
  outstanding_balance: "0.00",
  bond: maturityValue,
  cash_flows: [
    { date: "2026-11-06", ...quiet, outstanding_balance: "250000.00", net_worth: "-210000.00" },
    {
      date: "2035-05-15",
      ...quiet,
      redeemed: maturityValue,
      outstanding_balance: "0.00",
      net_worth: "41380.00",
    },
  ],
};
const sell: Scenario = {
  net_worth: "39240.00",
  cash: "12000.00",
  outstanding_balance: "0.00",
  cash_flows: [
    {
      date: "2026-11-06",
      ...quiet,
      sold: ipca2035.values?.market,
      prepaid: "18204.10",
      outstanding_balance: "231795.90",
      net_worth: "-219795.90",
    },
    { date: "2035-05-15", ...quiet, outstanding_balance: "0.00", net_worth: "39240.00" },
  ],
};

describe("a lot's detail", () => {
  it("shows the lot's net values and what each pays in taxes and fees", async () => {
    stubInvestments({ lots: [ipca2035] });
    renderAt("/investimentos/compras/1");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Tesouro IPCA+ 2035" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Compra em 12/05/2024 · 8 títulos a R$ 2.012,34 · IPCA + 6,21%"),
    ).toBeInTheDocument();
    expect(figures()).toEqual([
      "Valor a mercado R$ 18.204,10 se vender hoje, líquido",
      "Valor na curva R$ 18.950,62 pela taxa contratada, líquido",
      "No vencimento R$ 41.380,00 em 15/05/2035, líquido",
    ]);
    expect(rowTexts(screen.getByRole("table", { name: "Descontos" }))).toEqual([
      ["Valor", "A mercado", "Na curva", "No vencimento"],
      ["Valor bruto", "R$ 19.300,12", "R$ 20.100,00", "R$ 44.000,00"],
      ["Imposto de renda", "R$ 1.034,22", "R$ 1.083,58", "R$ 2.400,00"],
      ["Taxa de custódia (B3)", "R$ 61,80", "R$ 65,80", "R$ 220,00"],
      ["IOF", "R$ 0,00", "R$ 0,00", "R$ 0,00"],
      ["Valor líquido", "R$ 18.204,10", "R$ 18.950,62", "R$ 41.380,00"],
    ]);
    expect(screen.queryByRole("table", { name: "Cupons" })).toBeNull();
    expect(
      screen.getByText("Valores de 06/11/2026, com projeção — IPCA: Mediana do Focus (BCB)."),
    ).toBeInTheDocument();
  });

  it("lists a coupon bond's coupons and says when it has no sell price", async () => {
    stubInvestments({ lots: [prefixado2029] });
    renderAt("/investimentos/compras/3");

    const coupons = await screen.findByRole("table", { name: "Cupons" });
    expect(rowTexts(coupons)).toEqual([
      ["Data", "Situação", "Bruto", "IR", "Custódia", "Líquido"],
      ["01/01/2026", "Pago", "R$ 976,00", "R$ 170,80", "R$ 6,10", "R$ 799,10"],
      ["01/01/2027", "A receber", "R$ 976,00", "R$ 146,40", "R$ 5,20", "R$ 824,40"],
    ]);
    expect(figures()[0]).toBe("Valor a mercado — sem preço de venda hoje");
    expect(screen.getByText("Valores de 06/11/2026.")).toBeInTheDocument();
  });

  it("says a lot waits on the IPCA instead of showing its values", async () => {
    stubInvestments({
      lots: [waitingOnIpca],
      checks: [uncheckable(waitingOnIpca, "missing_ipca")],
    });
    renderAt("/investimentos/compras/4");

    expect(
      await screen.findByText(
        "Os valores desta compra dependem de um número-índice do IPCA que ainda não foi divulgado nem pode ser projetado.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Valor a mercado")).toBeNull();
    const panel = await earlySale();
    expect(await within(panel).findByText("Sem comparação por enquanto")).toBeInTheDocument();
  });

  it("states the early sale verdict, a loss in red, and follows the effect picked", async () => {
    const requests = stubInvestments({
      lots: [ipca2035],
      checks: {
        shorten_term: [checkFor(ipca2035, "2140.00")],
        lower_installment: [checkFor(ipca2035, "-310.55")],
      },
    });
    renderAt("/investimentos/compras/1");

    const panel = await earlySale();
    expect(await within(panel).findByRole("heading", { name: "Manter rende mais" })).toBeVisible();
    expect(
      within(panel).getByText(
        (_, element) =>
          element?.tagName === "P" &&
          text(element) ===
            "Vender hoje e amortizar ficaria R$ 2.140,00 abaixo de manter até o vencimento.",
      ),
    ).toBeInTheDocument();
    expect(within(panel).getByText("R$ 2.140,00")).toHaveClass("text-destructive");
    expect(
      within(panel).getByText(/^Comparação até 15\/05\/2035, com a mesma saída de dinheiro/),
    ).toHaveTextContent("O Tesouro Direto recompra hoje a IPCA + 6,40%, R$ 2.250,00 por título.");

    fireEvent.click(within(panel).getByRole("radio", { name: "Reduzir prestação" }));

    expect(await within(panel).findByRole("heading", { name: "Vender rende mais" })).toBeVisible();
    expect(within(panel).getByText("R$ 310,55")).toHaveClass("text-positive");
    expect(
      requests
        .filter((r) => new URL(r.url).pathname === "/api/early-sale-checks")
        .map((r) => new URL(r.url).searchParams.get("effect")),
    ).toEqual(["shorten_term", "lower_installment"]);
  });

  it("opens with the effect a link from Venda antecipada carries", async () => {
    stubInvestments({
      lots: [ipca2035],
      checks: {
        shorten_term: [checkFor(ipca2035, "2140.00")],
        lower_installment: [checkFor(ipca2035, "-310.55")],
      },
    });
    renderAt("/investimentos/compras/1?efeito=reduzir-prestacao");

    const panel = await earlySale();
    expect(await within(panel).findByRole("heading", { name: "Vender rende mais" })).toBeVisible();
    expect(within(panel).getByRole("radio", { name: "Reduzir prestação" })).toBeChecked();
  });

  it("edits the lot in a sheet and shows what was saved", async () => {
    let edited = ipca2035;
    const requests = stubInvestments({
      lots: [ipca2035],
      routes: {
        "PUT /api/lots/:id": (req, { id }) => {
          const body = req.body as LotInput;
          edited = { ...ipca2035, ...body, id: Number(id) };
          return Response.json({ ...body, id: Number(id) });
        },
        "GET /api/lots": () => Response.json({ lots: [edited] }),
      },
    });
    renderAt("/investimentos/compras/1");

    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    const sheet = await screen.findByRole("form", { name: "Editar compra" });
    fireEvent.change(within(sheet).getByLabelText("Quantidade"), { target: { value: "10" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));

    const notice = await screen.findByRole("dialog", { name: "Compra atualizada" });
    expect(screen.queryByRole("form")).toBeNull();
    fireEvent.click(within(notice).getByRole("button", { name: "Entendi" }));
    expect(
      await screen.findByText("Compra em 12/05/2024 · 10 títulos a R$ 2.012,34 · IPCA + 6,21%"),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(requests.filter((r) => r.method === "PUT").map((r) => r.body)).toEqual([
      {
        type: "ntn_b_principal",
        maturity: "2035-05-15",
        purchase_date: "2024-05-12",
        rate: "0.0621",
        unit_price: "2012.34",
        quantity: "10",
      },
    ]);
  });

  it("deletes the lot once confirmed and goes back to Compras", async () => {
    const requests = stubInvestments({ lots: [ipca2035, prefixado2029] });
    renderAt("/investimentos/compras/1");

    fireEvent.click(await screen.findByRole("button", { name: "Excluir" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Excluir esta compra?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Excluir" }));

    const remaining = await screen.findByRole("region", {
      name: "Tesouro Prefixado com Juros Semestrais 2029",
    });
    expect(within(remaining).getAllByRole("link").map(words)).toEqual([
      "Compra em 10/01/2025 · 11,85% Sem preço de venda",
    ]);
    expect(screen.queryByRole("region", { name: "Tesouro IPCA+ 2035" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      requests.filter((r) => r.method === "DELETE").map((r) => new URL(r.url).pathname),
    ).toEqual(["/api/lots/1"]);
  });

  it("unfolds the scenarios the check compares, the sale on its first day", async () => {
    stubInvestments({
      lots: [ipca2035],
      checks: [{ ...checkFor(ipca2035, "2140.00"), hold, sell }],
    });
    renderAt("/investimentos/compras/1");

    const panel = await earlySale();
    fireEvent.click(await within(panel).findByRole("button", { name: "Ver cenários" }));

    const holding = within(panel).getByRole("region", { name: "Manter" });
    expect(rowTexts(within(holding).getByRole("table", { name: "Resumo de Manter" }))).toEqual([
      ["Patrimônio líquido no horizonte", "R$ 41.380,00"],
      ["Caixa retido no horizonte", "R$ 0,00"],
      ["Saldo devedor no horizonte", "R$ 0,00"],
    ]);
    const selling = within(panel).getByRole("region", { name: "Vender" });
    expect(rowTexts(within(selling).getByRole("table", { name: "Resumo de Vender" }))).toEqual([
      ["Patrimônio líquido no horizonte", "R$ 39.240,00"],
      ["Caixa retido no horizonte", "R$ 12.000,00"],
      ["Saldo devedor no horizonte", "R$ 0,00"],
    ]);
    const [, firstDay] = rowTexts(
      within(selling).getByRole("table", { name: "Fluxo de caixa de Vender" }),
    );
    expect(firstDay).toContain("Venda");
    expect(firstDay).toContain("R$ 18.204,10");
  });

  it("says when no lot has the address's ID", async () => {
    stubInvestments({ lots: [ipca2035] });
    renderAt("/investimentos/compras/99");

    expect(await screen.findByRole("heading", { name: "Esta compra não existe" })).toBeVisible();
  });
});
