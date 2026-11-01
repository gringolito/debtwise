import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  EarlySaleCheck,
  EarlySaleCheckList,
  Lot,
  LotAmount,
  Scenario,
  VerdictMarketData,
} from "@/lib/api";
import { rowTexts } from "@/test/dom";
import { renderAt } from "@/test/renderAt";
import { problem, stubRoutes } from "@/test/stubServer";

afterEach(() => {
  vi.unstubAllGlobals();
});

const freshMarketData: VerdictMarketData = {
  bonds: { status: "fresh", refreshed_at: "2026-10-27T18:24:00Z" },
  focus: { status: "fresh", refreshed_at: "2026-10-27T18:24:30Z" },
  indexes: [],
};

const ltnLot: Lot = {
  id: 1,
  type: "ltn",
  maturity: "2029-01-01",
  purchase_date: "2025-01-02",
  rate: "0.11",
  unit_price: "650.00",
  quantity: "10.00",
};

const ntnbPrincipalLot: Lot = {
  id: 2,
  type: "ntn_b_principal",
  maturity: "2032-08-15",
  purchase_date: "2026-05-04",
  rate: "0.07",
  unit_price: "3200.00",
  quantity: "1.00",
};

const maturedLot: Lot = { ...ltnLot, id: 3, maturity: "2026-01-01" };

const sold: LotAmount = {
  gross: "7694.90",
  iof: "0.00",
  income_tax: "204.21",
  custody_fee: "28.00",
  net: "7462.69",
  projected_by: [],
};

const maturity: LotAmount = {
  gross: "10000.00",
  iof: "0.00",
  income_tax: "513.00",
  custody_fee: "80.00",
  net: "9407.00",
  projected_by: [],
};

const hold: Scenario = {
  net_worth: "9407.00",
  cash: "0.00",
  outstanding_balance: "0.00",
  bond: maturity,
  cash_flows: [
    {
      date: "2026-10-28",
      invested: "0.00",
      prepaid: "0.00",
      held: "0.00",
      outstanding_balance: "15000.00",
    },
    {
      date: "2029-01-01",
      invested: "0.00",
      prepaid: "0.00",
      held: "0.00",
      redeemed: maturity,
      outstanding_balance: "0.00",
    },
  ],
};

const sell: Scenario = {
  net_worth: "10012.50",
  cash: "2550.19",
  outstanding_balance: "0.00",
  cash_flows: [
    {
      date: "2026-10-28",
      invested: "0.00",
      sold,
      prepaid: "7462.69",
      held: "0.00",
      outstanding_balance: "7537.31",
    },
    {
      date: "2029-01-01",
      invested: "0.00",
      prepaid: "0.00",
      held: "0.00",
      outstanding_balance: "0.00",
    },
  ],
};

const sellingCheck: EarlySaleCheck = {
  lot: ltnLot,
  verdict: "sell",
  sell_price: { rate: "0.1288", unit_price: "769.49" },
  market_value: sold,
  advantage: "-605.50",
  hold,
  sell,
  projected_by: [],
  market_data: freshMarketData,
};

const holdingCheck: EarlySaleCheck = {
  lot: ntnbPrincipalLot,
  verdict: "hold",
  sell_price: { rate: "0.0684", unit_price: "3256.93" },
  market_value: { ...sold, gross: "3256.93", net: "3240.00" },
  advantage: "120.00",
  hold: { ...hold, bond: { ...maturity, projected_by: [{ index: "ipca", method: "focus" }] } },
  sell,
  projected_by: [{ index: "ipca", method: "focus" }],
  market_data: freshMarketData,
};

const maturedCheck: EarlySaleCheck = {
  lot: maturedLot,
  unavailable: "matured",
  projected_by: [],
  market_data: freshMarketData,
};

function listOf(checks: EarlySaleCheck[], effect: EarlySaleCheckList["effect"] = "shorten_term") {
  return { date: "2026-10-28", effect, checks };
}

function stubChecks(respond: (effect: string | null) => Response) {
  return stubRoutes({
    "GET /api/early-sale-checks": (req) => respond(new URL(req.url).searchParams.get("effect")),
  });
}

const checkRegion = (name: string) => screen.findByRole("region", { name });

describe("the early sale checks", () => {
  it("lists every lot in the order the API ranks them, with its verdict and advantage", async () => {
    const requests = stubChecks(() =>
      Response.json(listOf([sellingCheck, holdingCheck, maturedCheck])),
    );
    renderAt("/venda-antecipada");

    const selling = await checkRegion("Tesouro Prefixado 2029 (compra em 02/01/2025)");
    expect(
      requests.map((r) => [r.method, new URL(r.url).pathname + new URL(r.url).search]),
    ).toEqual([["GET", "/api/early-sale-checks?effect=shorten_term"]]);
    expect(screen.getByLabelText("Efeito")).toHaveValue("shorten_term");
    expect(
      screen.getByText("Venda em 28/10/2026, lotes do mais ao menos favorável à venda"),
    ).toBeInTheDocument();
    const regionNames = screen
      .getAllByRole("region")
      .map(
        (region) =>
          document.getElementById(region.getAttribute("aria-labelledby") ?? "")?.textContent,
      );
    expect(regionNames).toEqual([
      "Tesouro Prefixado 2029 (compra em 02/01/2025)",
      "Tesouro IPCA+ 2032 (compra em 04/05/2026)",
      "Tesouro Prefixado 2026 (compra em 02/01/2025)",
    ]);

    expect(
      within(selling).getByText(
        "Vencimento (horizonte) 01/01/2029 · Taxa de venda 12,88% · Preço de venda R$ 769,49",
      ),
    ).toBeInTheDocument();
    expect(within(selling).getByText("Vender agora")).toBeInTheDocument();
    expect(
      within(selling).getByText("Vantagem: -R$ 605,50, a favor de vender"),
    ).toBeInTheDocument();
    expect(within(selling).getByText("Somente valores publicados.")).toBeInTheDocument();
    expect(
      rowTexts(
        within(selling).getByRole("table", {
          name: "Valores de Tesouro Prefixado 2029 (compra em 02/01/2025)",
        }),
      ),
    ).toEqual([
      ["Valor", "Bruto", "IOF", "IR", "Taxa de custódia", "Líquido", "Projeção"],
      [
        "Valor de mercado (venda hoje)",
        "R$ 7.694,90",
        "R$ 0,00",
        "R$ 204,21",
        "R$ 28,00",
        "R$ 7.462,69",
        "—",
      ],
      [
        "Valor no vencimento",
        "R$ 10.000,00",
        "R$ 0,00",
        "R$ 513,00",
        "R$ 80,00",
        "R$ 9.407,00",
        "—",
      ],
    ]);

    const holding = await checkRegion("Tesouro IPCA+ 2032 (compra em 04/05/2026)");
    expect(within(holding).getByText("Manter até o vencimento")).toBeInTheDocument();
    expect(
      within(holding).getByText("Vantagem: +R$ 120,00, a favor de manter"),
    ).toBeInTheDocument();
    expect(
      within(holding).getByText("Valores projetados — IPCA: Mediana do Focus (BCB)"),
    ).toBeInTheDocument();
  });

  it("says why a lot has no check, without a verdict", async () => {
    stubChecks(() =>
      Response.json(
        listOf([
          maturedCheck,
          { ...maturedCheck, lot: { ...ltnLot, id: 4 }, unavailable: "no_market_value" },
          {
            ...maturedCheck,
            lot: ntnbPrincipalLot,
            unavailable: "missing_ipca",
            sell_price: { rate: "0.0684", unit_price: "3256.93" },
          },
        ]),
      ),
    );
    renderAt("/venda-antecipada");

    const matured = await checkRegion("Tesouro Prefixado 2026 (compra em 02/01/2025)");
    expect(within(matured).getByText("O título deste lote já venceu.")).toBeInTheDocument();
    expect(within(matured).getByText("Vencimento (horizonte) 01/01/2026")).toBeInTheDocument();
    expect(within(matured).queryByText(/^Vantagem/)).toBeNull();
    expect(within(matured).queryByText("Manter até o vencimento")).toBeNull();
    expect(within(matured).queryByRole("button", { name: "Ver cenários" })).toBeNull();

    const unquoted = await checkRegion("Tesouro Prefixado 2029 (compra em 02/01/2025)");
    expect(
      within(unquoted).getByText(
        "O Tesouro Direto não informa um preço de venda para este título.",
      ),
    ).toBeInTheDocument();

    const ipca = await checkRegion("Tesouro IPCA+ 2032 (compra em 04/05/2026)");
    expect(
      within(ipca).getByText(
        "A comparação depende de um número-índice do IPCA que ainda não foi divulgado nem pode ser projetado.",
      ),
    ).toBeInTheDocument();
    expect(
      within(ipca).getByText(
        "Vencimento (horizonte) 15/08/2032 · Taxa de venda IPCA + 6,84% · Preço de venda R$ 3.256,93",
      ),
    ).toBeInTheDocument();
  });

  it("checks again with the effect the owner picks", async () => {
    const requests = stubChecks((effect) =>
      Response.json(
        listOf(
          [{ ...sellingCheck, advantage: effect === "lower_installment" ? "-600.00" : "-605.50" }],
          effect === "lower_installment" ? "lower_installment" : "shorten_term",
        ),
      ),
    );
    renderAt("/venda-antecipada");

    await screen.findByText("Vantagem: -R$ 605,50, a favor de vender");
    fireEvent.change(screen.getByLabelText("Efeito"), { target: { value: "lower_installment" } });

    expect(await screen.findByText("Vantagem: -R$ 600,00, a favor de vender")).toBeInTheDocument();
    expect(requests.map((r) => new URL(r.url).search)).toEqual([
      "?effect=shorten_term",
      "?effect=lower_installment",
    ]);
  });

  const cashFlowHeader = [
    "Data",
    "Nº",
    "Índice",
    "Correção",
    "Juros",
    "Amortização",
    "MIP",
    "DFI",
    "Taxa adm.",
    "Prestação",
    "Investido",
    "Amortização extraordinária",
    "Caixa retido",
    "Pagamento do título",
    "Bruto",
    "IOF",
    "IR",
    "Taxa de custódia",
    "Líquido",
    "Projeção",
    "Saldo devedor",
  ];

  it("shows holding and selling, with the sale on its first day", async () => {
    stubChecks(() => Response.json(listOf([sellingCheck])));
    renderAt("/venda-antecipada");

    const check = await checkRegion("Tesouro Prefixado 2029 (compra em 02/01/2025)");
    fireEvent.click(within(check).getByRole("button", { name: "Ver cenários" }));

    const holding = within(check).getByRole("region", { name: "Manter" });
    expect(rowTexts(within(holding).getByRole("table", { name: "Resumo de Manter" }))).toEqual([
      ["Patrimônio líquido no horizonte", "R$ 9.407,00"],
      ["Caixa retido no horizonte", "R$ 0,00"],
      ["Saldo devedor no horizonte", "R$ 0,00"],
    ]);
    expect(
      rowTexts(within(holding).getByRole("table", { name: "Valor no vencimento de Manter" })),
    ).toEqual([
      ["Valor", "Bruto", "IOF", "IR", "Taxa de custódia", "Líquido", "Projeção"],
      [
        "Valor no vencimento",
        "R$ 10.000,00",
        "R$ 0,00",
        "R$ 513,00",
        "R$ 80,00",
        "R$ 9.407,00",
        "—",
      ],
    ]);
    const dash = (count: number) => Array<string>(count).fill("—");
    expect(
      rowTexts(within(holding).getByRole("table", { name: "Fluxo de caixa de Manter" })),
    ).toEqual([
      cashFlowHeader,
      ["28/10/2026", ...dash(9), "R$ 0,00", "R$ 0,00", "R$ 0,00", ...dash(7), "R$ 15.000,00"],
      [
        "01/01/2029",
        ...dash(9),
        "R$ 0,00",
        "R$ 0,00",
        "R$ 0,00",
        "Resgate",
        "R$ 10.000,00",
        "R$ 0,00",
        "R$ 513,00",
        "R$ 80,00",
        "R$ 9.407,00",
        "—",
        "R$ 0,00",
      ],
    ]);

    const selling = within(check).getByRole("region", { name: "Vender" });
    expect(rowTexts(within(selling).getByRole("table", { name: "Resumo de Vender" }))).toEqual([
      ["Patrimônio líquido no horizonte", "R$ 10.012,50"],
      ["Caixa retido no horizonte", "R$ 2.550,19"],
      ["Saldo devedor no horizonte", "R$ 0,00"],
    ]);
    expect(within(selling).queryByRole("table", { name: /^Valor no vencimento/ })).toBeNull();
    expect(
      rowTexts(within(selling).getByRole("table", { name: "Fluxo de caixa de Vender" })),
    ).toEqual([
      cashFlowHeader,
      [
        "28/10/2026",
        ...dash(9),
        "R$ 0,00",
        "R$ 7.462,69",
        "R$ 0,00",
        "Venda",
        "R$ 7.694,90",
        "R$ 0,00",
        "R$ 204,21",
        "R$ 28,00",
        "R$ 7.462,69",
        "—",
        "R$ 7.537,31",
      ],
      ["01/01/2029", ...dash(9), "R$ 0,00", "R$ 0,00", "R$ 0,00", ...dash(7), "R$ 0,00"],
    ]);
  });

  it("asks for a mortgage when none is registered", async () => {
    stubChecks(() => problem(404, "Not Found", "no mortgage is registered"));
    renderAt("/venda-antecipada");

    expect(await screen.findByText(/Nenhum financiamento cadastrado/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cadastrar financiamento" })).toHaveAttribute(
      "href",
      "/financiamento/editar",
    );
  });

  it("says when the checks could not be computed", async () => {
    stubChecks(() => problem(500, "Internal Server Error", "unexpected error"));
    renderAt("/venda-antecipada");

    expect(await screen.findByText("Não foi possível comparar os lotes.")).toBeInTheDocument();
  });

  it("asks for a lot when none is recorded", async () => {
    stubChecks(() => Response.json(listOf([])));
    renderAt("/venda-antecipada");

    expect(await screen.findByText(/Nenhum lote registrado/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Registrar lote" })).toHaveAttribute("href", "/lotes");
  });
});
