import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CashFlow, Decision, Scenario, Verdict, VerdictMarketData } from "@/lib/api";
import { rowTexts, text } from "@/test/dom";
import { renderAt } from "@/test/renderAt";
import { problem, stubRoutes } from "@/test/stubServer";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const freshMarketData: VerdictMarketData = {
  bonds: { status: "fresh", refreshed_at: "2026-10-27T18:24:00Z" },
  focus: { status: "fresh", refreshed_at: "2026-10-27T18:24:30Z" },
  indexes: [],
};

const ltnVerdict: Verdict = {
  type: "ltn",
  maturity: "2029-01-01",
  rate: "0.1276",
  unit_price: "771.26",
  quantity: "12.96",
  advantage: "1234.56",
  avoided_cost: "456.78",
  projected_by: [],
  market_data: freshMarketData,
};

const ntnbPrincipalVerdict: Verdict = {
  type: "ntn_b_principal",
  maturity: "2032-08-15",
  rate: "0.0672",
  unit_price: "3278.12",
  quantity: "3.05",
  advantage: "-250.30",
  avoided_cost: "1800.00",
  projected_by: [],
  market_data: freshMarketData,
};

function decisionOf(verdicts: Verdict[], input: Partial<Decision> = {}): Decision {
  return {
    amount: "10000.00",
    date: "2026-10-27",
    effect: "shorten_term",
    verdicts,
    ...input,
  };
}

function stubDecisions(respond: () => Response) {
  return stubRoutes({ "POST /api/decisions": respond });
}

function fill(form: HTMLElement, label: string, value: string) {
  fireEvent.change(within(form).getByLabelText(label), { target: { value } });
}

const decisionForm = () => screen.findByRole("form", { name: "Simular decisão" });
const verdictRegion = (name: string) => screen.findByRole("region", { name });

describe("the decision form", () => {
  it("sends the amount, today and the effect, and lists the bond of each verdict", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 27, 23, 30));
    const requests = stubDecisions(() => Response.json(decisionOf([ltnVerdict])));
    renderAt("/decisao");

    const form = await decisionForm();
    expect(within(form).getByLabelText("Data")).toHaveValue("2026-10-27");
    expect(within(form).getByLabelText("Efeito")).toHaveValue("shorten_term");
    fill(form, "Valor", "10.000,00");
    fireEvent.click(within(form).getByRole("button", { name: "Comparar" }));

    const verdict = await verdictRegion("Tesouro Prefixado 2029");
    expect(requests.map((r) => [r.method, new URL(r.url).pathname, r.body])).toEqual([
      [
        "POST",
        "/api/decisions",
        { amount: "10000.00", date: "2026-10-27", effect: "shorten_term" },
      ],
    ]);
    expect(
      within(verdict).getByText(
        "Vencimento (horizonte) 01/01/2029 · Taxa 12,76% · Preço R$ 771,26 · Quantidade 12,96",
      ),
    ).toBeInTheDocument();
  });

  it("tells the advantage apart from the avoided cost and says which option it favours", async () => {
    stubDecisions(() => Response.json(decisionOf([ltnVerdict, ntnbPrincipalVerdict])));
    renderAt("/decisao");

    const form = await decisionForm();
    fill(form, "Valor", "10000");
    fireEvent.click(within(form).getByRole("button", { name: "Comparar" }));

    const ltn = await verdictRegion("Tesouro Prefixado 2029");
    expect(
      within(ltn).getByText("Vantagem: +R$ 1.234,56, a favor de investir"),
    ).toBeInTheDocument();
    expect(within(ltn).getByText("Custo evitado ao amortizar: R$ 456,78")).toBeInTheDocument();
    const ntnb = await verdictRegion("Tesouro IPCA+ 2032");
    expect(
      within(ntnb).getByText("Vantagem: -R$ 250,30, a favor de amortizar"),
    ).toBeInTheDocument();
    expect(within(ntnb).getByText("Custo evitado ao amortizar: R$ 1.800,00")).toBeInTheDocument();
  });

  it("favours neither option when the advantage is zero", async () => {
    stubDecisions(() =>
      Response.json(
        decisionOf([{ ...ntnbPrincipalVerdict, advantage: "0.00", avoided_cost: "0.00" }]),
      ),
    );
    renderAt("/decisao");

    const form = await decisionForm();
    fill(form, "Valor", "10000");
    fireEvent.click(within(form).getByRole("button", { name: "Comparar" }));

    const verdict = await verdictRegion("Tesouro IPCA+ 2032");
    expect(
      within(verdict).getByText("Vantagem: R$ 0,00, sem diferença entre investir e amortizar"),
    ).toBeInTheDocument();
  });

  it("names the projection method of each index, or says only published values were read", async () => {
    const projected: Verdict = {
      ...ntnbPrincipalVerdict,
      projected_by: [
        { index: "ipca", method: "focus" },
        { index: "selic", method: "trailing_12" },
      ],
    };
    stubDecisions(() => Response.json(decisionOf([ltnVerdict, projected])));
    renderAt("/decisao");

    const form = await decisionForm();
    fill(form, "Valor", "10000");
    fireEvent.click(within(form).getByRole("button", { name: "Comparar" }));

    const ltn = await verdictRegion("Tesouro Prefixado 2029");
    expect(within(ltn).getByText("Somente valores publicados.")).toBeInTheDocument();
    const ntnb = await verdictRegion("Tesouro IPCA+ 2032");
    expect(
      within(ntnb).getByText(
        "Valores projetados — IPCA: Mediana do Focus (BCB); Selic diária: Média dos últimos 12 meses",
      ),
    ).toBeInTheDocument();
  });

  it("shows how fresh the market data of a verdict is, and warns about what is not", async () => {
    const marketData: VerdictMarketData = {
      bonds: { status: "stale", refreshed_at: "2026-10-23T09:05:00Z" },
      focus: { status: "fresh", refreshed_at: "2026-10-27T18:24:30Z" },
      indexes: [
        { index: "ipca", status: "fresh", refreshed_at: "2026-10-27T18:23:43Z" },
        {
          index: "tr",
          status: "failed",
          refreshed_at: "2026-10-25T18:23:39Z",
          failed_at: "2026-10-27T17:00:00Z",
        },
        { index: "selic", status: "missing" },
      ],
    };
    stubDecisions(() => Response.json(decisionOf([{ ...ltnVerdict, market_data: marketData }])));
    renderAt("/decisao");

    const form = await decisionForm();
    fill(form, "Valor", "10000");
    fireEvent.click(within(form).getByRole("button", { name: "Comparar" }));

    const verdict = await verdictRegion("Tesouro Prefixado 2029");
    const freshness = within(verdict).getByRole("list", { name: "Dados de mercado" });
    expect(within(freshness).getAllByRole("listitem").map(text)).toEqual([
      "Preços dos títulos: Atualizado em 23/10/2026 09:05 Dados desatualizados: a última atualização foi há mais de dois dias.",
      "Focus: Atualizado em 27/10/2026 18:24",
      "IPCA: Atualizado em 27/10/2026 18:23",
      "TR: Atualizado em 25/10/2026 18:23 A última atualização falhou em 27/10/2026 17:00.",
      "Selic diária: Nunca atualizado Ainda não há dados deste índice.",
    ]);
  });
});

const dash = (count: number) => Array<string>(count).fill("—");

const investFlows: CashFlow[] = [
  {
    date: "2026-10-27",
    invested: "10000.00",
    prepaid: "0.00",
    held: "0.00",
    outstanding_balance: "190000.00",
  },
  {
    date: "2026-11-05",
    installment: {
      number: 2,
      correction: "310.25",
      interest: "1500.10",
      amortization: "800.40",
      mip: "45.00",
      dfi: "30.00",
      fee: "25.00",
      amount: "2710.75",
      index_values: [
        {
          index: "ipca",
          status: "projected",
          value: "0.43",
          period_start: "2026-10-01",
          period_end: "2026-10-01",
          methods: [{ index: "ipca", method: "focus" }],
        },
      ],
    },
    invested: "0.00",
    prepaid: "0.00",
    held: "-120.50",
    outstanding_balance: "189199.60",
  },
  {
    date: "2029-01-01",
    invested: "0.00",
    prepaid: "0.00",
    held: "0.00",
    redeemed: {
      gross: "13500.00",
      iof: "0.00",
      income_tax: "525.00",
      custody_fee: "98.00",
      net: "12877.00",
      projected_by: [],
    },
    outstanding_balance: "151000.00",
  },
];

const prepayFlows: CashFlow[] = [
  {
    date: "2026-10-27",
    invested: "0.00",
    prepaid: "10000.00",
    held: "0.00",
    outstanding_balance: "180000.00",
  },
  {
    date: "2026-11-05",
    installment: {
      number: 2,
      correction: "293.98",
      interest: "1421.14",
      amortization: "800.40",
      mip: "42.60",
      dfi: "30.00",
      fee: "25.00",
      amount: "2613.12",
      index_values: [
        {
          index: "ipca",
          status: "published",
          value: "0.43",
          period_start: "2026-10-01",
          period_end: "2026-10-01",
          methods: [],
        },
      ],
    },
    invested: "0.00",
    prepaid: "0.00",
    held: "0.00",
    outstanding_balance: "179493.30",
  },
  {
    date: "2029-01-01",
    invested: "0.00",
    prepaid: "0.00",
    held: "10642.44",
    outstanding_balance: "150000.00",
  },
];

const invest: Scenario = {
  net_worth: "-138123.00",
  cash: "0.00",
  outstanding_balance: "151000.00",
  bond: {
    gross: "13500.00",
    iof: "0.00",
    income_tax: "525.00",
    custody_fee: "98.00",
    net: "12877.00",
    projected_by: [],
  },
  cash_flows: investFlows,
};

const prepay: Scenario = {
  net_worth: "-139357.56",
  cash: "10642.44",
  outstanding_balance: "150000.00",
  cash_flows: prepayFlows,
};

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
  "Resgate bruto",
  "IOF",
  "IR",
  "Taxa de custódia",
  "Resgate líquido",
  "Saldo devedor",
];

describe("the scenarios of a verdict", () => {
  it("lists the summary and every monthly cash flow of investing and of prepaying", async () => {
    stubDecisions(() => Response.json(decisionOf([{ ...ltnVerdict, invest, prepay }])));
    renderAt("/decisao");

    const form = await decisionForm();
    fill(form, "Valor", "10000");
    fireEvent.click(within(form).getByRole("button", { name: "Comparar" }));
    const verdict = await verdictRegion("Tesouro Prefixado 2029");
    expect(within(verdict).queryByRole("table")).toBeNull();
    fireEvent.click(within(verdict).getByRole("button", { name: "Ver cenários" }));

    const investing = within(verdict).getByRole("region", { name: "Investir" });
    expect(rowTexts(within(investing).getByRole("table", { name: "Resumo de Investir" }))).toEqual([
      ["Patrimônio líquido no horizonte", "-R$ 138.123,00"],
      ["Caixa retido no horizonte", "R$ 0,00"],
      ["Saldo devedor no horizonte", "R$ 151.000,00"],
    ]);
    expect(
      rowTexts(within(investing).getByRole("table", { name: "Valor no vencimento de Investir" })),
    ).toEqual([
      ["Valor", "Bruto", "IOF", "IR", "Taxa de custódia", "Líquido", "Projeção"],
      [
        "Valor no vencimento",
        "R$ 13.500,00",
        "R$ 0,00",
        "R$ 525,00",
        "R$ 98,00",
        "R$ 12.877,00",
        "—",
      ],
    ]);
    expect(
      rowTexts(within(investing).getByRole("table", { name: "Fluxo de caixa de Investir" })),
    ).toEqual([
      cashFlowHeader,
      ["27/10/2026", ...dash(9), "R$ 10.000,00", "R$ 0,00", "R$ 0,00", ...dash(5), "R$ 190.000,00"],
      [
        "05/11/2026",
        "2",
        "IPCA 0,43% Projetado out/2026 IPCA: Mediana do Focus (BCB)",
        "R$ 310,25",
        "R$ 1.500,10",
        "R$ 800,40",
        "R$ 45,00",
        "R$ 30,00",
        "R$ 25,00",
        "R$ 2.710,75",
        "R$ 0,00",
        "R$ 0,00",
        "-R$ 120,50",
        ...dash(5),
        "R$ 189.199,60",
      ],
      [
        "01/01/2029",
        ...dash(9),
        "R$ 0,00",
        "R$ 0,00",
        "R$ 0,00",
        "R$ 13.500,00",
        "R$ 0,00",
        "R$ 525,00",
        "R$ 98,00",
        "R$ 12.877,00",
        "R$ 151.000,00",
      ],
    ]);

    const prepaying = within(verdict).getByRole("region", { name: "Amortizar" });
    expect(rowTexts(within(prepaying).getByRole("table", { name: "Resumo de Amortizar" }))).toEqual(
      [
        ["Patrimônio líquido no horizonte", "-R$ 139.357,56"],
        ["Caixa retido no horizonte", "R$ 10.642,44"],
        ["Saldo devedor no horizonte", "R$ 150.000,00"],
      ],
    );
    expect(within(prepaying).queryByRole("table", { name: /^Valor no vencimento/ })).toBeNull();
    expect(
      rowTexts(within(prepaying).getByRole("table", { name: "Fluxo de caixa de Amortizar" })),
    ).toEqual([
      cashFlowHeader,
      ["27/10/2026", ...dash(9), "R$ 0,00", "R$ 10.000,00", "R$ 0,00", ...dash(5), "R$ 180.000,00"],
      [
        "05/11/2026",
        "2",
        "IPCA 0,43% out/2026",
        "R$ 293,98",
        "R$ 1.421,14",
        "R$ 800,40",
        "R$ 42,60",
        "R$ 30,00",
        "R$ 25,00",
        "R$ 2.613,12",
        "R$ 0,00",
        "R$ 0,00",
        "R$ 0,00",
        ...dash(5),
        "R$ 179.493,30",
      ],
      ["01/01/2029", ...dash(9), "R$ 0,00", "R$ 0,00", "R$ 10.642,44", ...dash(5), "R$ 150.000,00"],
    ]);

    fireEvent.click(within(verdict).getByRole("button", { name: "Ocultar cenários" }));
    expect(within(verdict).queryByRole("table")).toBeNull();
  });
});

describe("a verdict that is unavailable", () => {
  const missingIpca: Verdict = {
    type: "ntn_b_principal",
    maturity: "2035-05-15",
    rate: "0.0688",
    unavailable: "missing_ipca",
    projected_by: [],
    market_data: freshMarketData,
  };
  const tooSmall: Verdict = {
    type: "ltn",
    maturity: "2027-01-01",
    rate: "0.1391",
    unit_price: "880.50",
    quantity: "0.00",
    unavailable: "amount_too_small",
    projected_by: [],
    market_data: freshMarketData,
  };

  it("gives the reason instead of an advantage and scenarios", async () => {
    stubDecisions(() => Response.json(decisionOf([missingIpca, tooSmall, ltnVerdict])));
    renderAt("/decisao");

    const form = await decisionForm();
    fill(form, "Valor", "10");
    fireEvent.click(within(form).getByRole("button", { name: "Comparar" }));

    const ipca = await verdictRegion("Tesouro IPCA+ 2035");
    expect(
      within(ipca).getByText("Vencimento (horizonte) 15/05/2035 · Taxa IPCA + 6,88%"),
    ).toBeInTheDocument();
    expect(
      within(ipca).getByText(
        "A comparação depende de um número-índice do IPCA que ainda não foi divulgado nem pode ser projetado.",
      ),
    ).toBeInTheDocument();
    expect(within(ipca).queryByText(/Vantagem/)).toBeNull();
    expect(within(ipca).queryByRole("button", { name: "Ver cenários" })).toBeNull();

    const small = await verdictRegion("Tesouro Prefixado 2027");
    expect(
      within(small).getByText(
        "Vencimento (horizonte) 01/01/2027 · Taxa 13,91% · Preço R$ 880,50 · Quantidade 0",
      ),
    ).toBeInTheDocument();
    expect(
      within(small).getByText(
        "O valor compra menos que um centésimo do título. Informe um valor maior.",
      ),
    ).toBeInTheDocument();
    expect(within(small).queryByText(/Custo evitado/)).toBeNull();
    expect(within(small).queryByRole("button", { name: "Ver cenários" })).toBeNull();

    const available = await verdictRegion("Tesouro Prefixado 2029");
    expect(within(available).getByText(/Vantagem/)).toBeInTheDocument();
  });
});

describe("a decision the server rejects", () => {
  it("sends the date and the effect the owner chose", async () => {
    const requests = stubDecisions(() =>
      Response.json(decisionOf([ltnVerdict], { effect: "lower_installment", date: "2026-12-01" })),
    );
    renderAt("/decisao");

    const form = await decisionForm();
    fill(form, "Valor", "2.500,50");
    fill(form, "Data", "2026-12-01");
    fill(form, "Efeito", "lower_installment");
    fireEvent.click(within(form).getByRole("button", { name: "Comparar" }));

    await verdictRegion("Tesouro Prefixado 2029");
    expect(requests.map((r) => r.body)).toEqual([
      { amount: "2500.50", date: "2026-12-01", effect: "lower_installment" },
    ]);
  });

  it("leaves the date out when the owner clears it, for the server to use today", async () => {
    const requests = stubDecisions(() => Response.json(decisionOf([ltnVerdict])));
    renderAt("/decisao");

    const form = await decisionForm();
    fill(form, "Valor", "10.000,00");
    fill(form, "Data", "");
    fireEvent.click(within(form).getByRole("button", { name: "Comparar" }));

    await verdictRegion("Tesouro Prefixado 2029");
    expect(requests.map((r) => r.body)).toEqual([{ amount: "10000.00", effect: "shorten_term" }]);
  });

  it("shows the reason next to each field the server rejects", async () => {
    stubDecisions(() =>
      problem(422, "Unprocessable Entity", "validation failed", [
        { location: "body.amount", message: "must be greater than zero" },
        { location: "body.date", message: "must not be before today" },
      ]),
    );
    renderAt("/decisao");

    const form = await decisionForm();
    fill(form, "Valor", "0");
    fireEvent.click(within(form).getByRole("button", { name: "Comparar" }));

    await within(form).findByText("Informe um valor maior que zero, com até 2 casas decimais.");
    expect(within(form).getByLabelText("Valor")).toBeInvalid();
    expect(within(form).getByLabelText("Data")).toBeInvalid();
    expect(within(form).getByLabelText("Data")).toHaveAccessibleDescription(
      "A data não pode ser anterior a hoje.",
    );
    expect(within(form).getByLabelText("Efeito")).toBeValid();
    expect(screen.queryByRole("region")).toBeNull();
  });
});

describe("a decision with nothing to compare", () => {
  it("says no mortgage is registered and links to its registration", async () => {
    stubDecisions(() => problem(404, "Not Found", "no mortgage is registered"));
    renderAt("/decisao");

    const form = await decisionForm();
    fill(form, "Valor", "10000");
    fireEvent.click(within(form).getByRole("button", { name: "Comparar" }));

    const alert = await screen.findByRole("alert");
    expect(text(alert)).toBe("Nenhum financiamento cadastrado. Cadastrar financiamento.");
    expect(within(alert).getByRole("link", { name: "Cadastrar financiamento" })).toHaveAttribute(
      "href",
      "/financiamento/editar",
    );
  });

  it("says the comparison failed when the server breaks", async () => {
    stubDecisions(() => problem(500, "Internal Server Error", "boom"));
    renderAt("/decisao");

    const form = await decisionForm();
    fill(form, "Valor", "10000");
    fireEvent.click(within(form).getByRole("button", { name: "Comparar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível comparar.");
    expect(screen.queryByRole("link", { name: "Cadastrar financiamento" })).toBeNull();
  });

  it("says no bond on offer follows the indexer of the mortgage", async () => {
    stubDecisions(() => Response.json(decisionOf([])));
    renderAt("/decisao");

    const form = await decisionForm();
    fill(form, "Valor", "10000");
    fireEvent.click(within(form).getByRole("button", { name: "Comparar" }));

    expect(
      await screen.findByText("Nenhum título à venda acompanha o indexador do financiamento."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region")).toBeNull();
  });
});
