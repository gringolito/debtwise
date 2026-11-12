import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CashFlow,
  CorrectionIndex,
  Decision,
  Scenario,
  Verdict,
  VerdictMarketData,
} from "@/lib/api";
import { today } from "@/lib/dashboard";
import { rowTexts, text } from "@/test/dom";
import { renderAt } from "@/test/renderAt";
import { problem, type RecordedRequest, stubRoutes } from "@/test/stubServer";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const freshMarketData: VerdictMarketData = {
  bonds: { status: "fresh", refreshed_at: "2026-10-27T18:24:00Z" },
  focus: { status: "fresh", refreshed_at: "2026-10-27T18:24:30Z" },
  indexes: [],
};

const dash = (count: number) => Array<string>(count).fill("—");

const investFlows: CashFlow[] = [
  {
    date: "2026-10-27",
    invested: "10000.00",
    prepaid: "0.00",
    held: "0.00",
    outstanding_balance: "190000.00",
    net_worth: "-180000.00",
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
    net_worth: "-179250.10",
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
    net_worth: "-138123.00",
  },
];

const prepayFlows: CashFlow[] = [
  {
    date: "2026-10-27",
    invested: "0.00",
    prepaid: "10000.00",
    held: "0.00",
    outstanding_balance: "180000.00",
    net_worth: "-180000.00",
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
    net_worth: "-179493.30",
  },
  {
    date: "2029-01-01",
    invested: "0.00",
    prepaid: "0.00",
    held: "10642.44",
    outstanding_balance: "150000.00",
    net_worth: "-139357.56",
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

const ltnVerdict: Verdict = {
  type: "ltn",
  maturity: "2029-01-01",
  rate: "0.1276",
  unit_price: "771.26",
  quantity: "12.96",
  advantage: "1234.56",
  advantage_share: "0.1234",
  near_tie: false,
  horizon_months: 26,
  avoided_cost: "456.78",
  break_even_rate: "0.1102",
  invest,
  prepay,
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
  advantage_share: "0.0250",
  near_tie: false,
  horizon_months: 70,
  avoided_cost: "1800.00",
  break_even_rate: "0.0712",
  invest,
  prepay,
  projected_by: [],
  market_data: freshMarketData,
};

function decisionOf(verdicts: Verdict[], input: Partial<Decision> = {}): Decision {
  return {
    amount: "10000.00",
    date: today(),
    effect: "shorten_term",
    verdicts,
    ...input,
  };
}

function stubDecisions(respond: () => Response) {
  return stubRoutes({ "POST /api/decisions": respond });
}

const sentence = () => screen.findByRole("form", { name: "Decisão" });

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function compare(verdicts: Verdict[], amount = "10000", input: Partial<Decision> = {}) {
  const requests = stubDecisions(() => Response.json(decisionOf(verdicts, input)));
  renderAt("/comparar");
  await sentence();
  fill("Valor", amount);
  fireEvent.click(screen.getByRole("button", { name: "Comparar" }));
  return requests;
}

/** The verdict panel, which its headline names: who ends with more, or that it is a tie. */
const verdictPanel = () =>
  screen.findByRole("region", { name: / rende mais| dá (praticamente )?no mesmo/ });
const otherBonds = () => screen.getByRole("region", { name: "Outros títulos" });

/** What one option of the verdict panel says: its title, what it is, what it ends with and why. */
const outcome = (panel: HTMLElement, title: string) =>
  Array.from(
    within(panel).getByRole("region", { name: title }).querySelectorAll("h3, p, dt, dd"),
  ).map(text);

/** The bodies of the comparisons asked, leaving out what the stale data note reads. */
const asked = (requests: RecordedRequest[]) =>
  requests.filter((r) => r.method === "POST").map((r) => r.body);

/** The text of each part of each row of a grouped list: its label, any notes under it, its value. */
const rows = (list: HTMLElement) =>
  within(list)
    .getAllByRole("listitem")
    .map((item) =>
      Array.from(item.firstElementChild?.children ?? [])
        .flatMap((cell) => (cell.children.length > 1 ? Array.from(cell.children) : [cell]))
        .map(text)
        .filter(Boolean),
    );

describe("arriving with an amount in the address", () => {
  it("compares the amount at once when asked to", async () => {
    const requests = stubDecisions(() => Response.json(decisionOf([ltnVerdict])));
    renderAt("/comparar?valor=10000&comparar=true");

    await verdictPanel();
    expect(screen.getByLabelText("Valor")).toHaveValue("10.000");
    expect(
      requests.filter((r) => r.method === "POST").map((r) => [new URL(r.url).pathname, r.body]),
    ).toEqual([["/api/decisions", { amount: "10000", effect: "shorten_term" }]]);
  });

  it("only fills in the amount otherwise", async () => {
    const requests = stubDecisions(() => Response.json(decisionOf([ltnVerdict])));
    renderAt("/comparar?valor=1234.5");

    await sentence();
    expect(screen.getByLabelText("Valor")).toHaveValue("1.234,5");
    expect(requests).toEqual([]);
  });

  it.each(["?valor=abc&comparar=true", "?valor=-5&comparar=true"])(
    "ignores an amount that is no positive number in %s",
    async (search) => {
      const requests = stubDecisions(() => Response.json(decisionOf([ltnVerdict])));
      renderAt(`/comparar${search}`);

      await sentence();
      expect(screen.getByLabelText("Valor")).toHaveValue("");
      expect(requests).toEqual([]);
    },
  );
});

describe("the question as a sentence", () => {
  it("reads today and a shorter term until the owner changes them, and leaves the date to the server", async () => {
    const requests = await compare([ltnVerdict], "10.000,00");

    await verdictPanel();
    expect(screen.getByRole("button", { name: "Data: hoje" })).toHaveTextContent("hoje");
    expect(screen.getByLabelText("Efeito")).toHaveDisplayValue("reduzir o prazo");
    expect(asked(requests)).toEqual([{ amount: "10000.00", effect: "shorten_term" }]);
  });

  it("groups the thousands of the amount while the owner types it", async () => {
    stubDecisions(() => Response.json(decisionOf([ltnVerdict])));
    renderAt("/comparar");
    await sentence();

    fill("Valor", "1250000,5");
    expect(screen.getByLabelText("Valor")).toHaveValue("1.250.000,5");
  });

  it("sends the date the owner typed as dd/mm/aaaa and the effect they chose", async () => {
    const requests = stubDecisions(() =>
      Response.json(decisionOf([ltnVerdict], { effect: "lower_installment", date: "2026-12-01" })),
    );
    renderAt("/comparar");
    await sentence();

    fill("Valor", "2.500,50");
    fireEvent.click(screen.getByRole("button", { name: "Data: hoje" }));
    fill("Data", "01/12/2026");
    fireEvent.blur(screen.getByLabelText("Data"));
    fill("Efeito", "lower_installment");

    expect(
      screen.getByRole("button", { name: "Data: 01/12/2026" }).parentElement,
    ).toHaveTextContent("Se eu tiver R$ em 01/12/2026 para");
    expect(screen.getByLabelText("Efeito")).toHaveDisplayValue("reduzir a prestação");
    fireEvent.click(screen.getByRole("button", { name: "Comparar" }));

    await verdictPanel();
    expect(asked(requests)).toEqual([
      { amount: "2500.50", date: "2026-12-01", effect: "lower_installment" },
    ]);
  });

  it("returns to today once the owner clears the date", async () => {
    stubDecisions(() => Response.json(decisionOf([ltnVerdict])));
    renderAt("/comparar");
    await sentence();

    fireEvent.click(screen.getByRole("button", { name: "Data: hoje" }));
    fill("Data", "01/12/2026");
    fireEvent.blur(screen.getByLabelText("Data"));
    fireEvent.click(screen.getByRole("button", { name: "Data: 01/12/2026" }));
    fill("Data", "");
    fireEvent.blur(screen.getByLabelText("Data"));

    expect(screen.getByRole("button", { name: "Data: hoje" })).toBeInTheDocument();
  });

  it("says a date that does not exist does not, while the owner is typing it", async () => {
    stubDecisions(() => Response.json(decisionOf([ltnVerdict])));
    renderAt("/comparar");
    await sentence();

    fireEvent.click(screen.getByRole("button", { name: "Data: hoje" }));
    fill("Data", "31/02/2026");

    expect(screen.getByText("Essa data não existe.")).toBeInTheDocument();
    expect(screen.getByLabelText("Data")).toBeInvalid();
    expect(screen.getByLabelText("Data")).toHaveAccessibleDescription("Essa data não existe.");

    fill("Data", "28/02/2026");
    expect(screen.queryByText("Essa data não existe.")).toBeNull();
  });
});

describe("the verdict panel", () => {
  it("says investing ends with more and where the money is in each option", async () => {
    await compare([ntnbPrincipalVerdict, ltnVerdict]);

    const panel = await verdictPanel();
    expect(
      within(panel).getByRole("heading", { name: "Investir em Tesouro Prefixado 2029 rende mais" }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText("Onde está o dinheiro em 01/01/2029, em cada opção."),
    ).toBeInTheDocument();
    expect(outcome(panel, "Se amortizar")).toEqual([
      "Se amortizar",
      "R$ 10.000,00 hoje",
      "No fim, você deve",
      "R$ 139.357,56",
      "Saldo devedor",
      "R$ 150.000,00",
      "Dinheiro do título, líquido",
      "Nenhum",
    ]);
    expect(outcome(panel, "Se investir")).toEqual([
      "Se investir",
      "Tesouro Prefixado 2029",
      "No fim, você deve",
      "R$ 138.123,00",
      "Saldo devedor",
      "R$ 151.000,00",
      "Dinheiro do título, líquido",
      "R$ 12.877,00",
    ]);
    expect(within(panel).getByText("Investir termina com R$ 1.234,56 a mais")).toBeInTheDocument();
    expect(
      within(panel).getByText("12,3% dos R$ 10.000,00 em 2 anos e 2 meses."),
    ).toBeInTheDocument();
  });

  it("says prepaying ends with more when it wins over every bond", async () => {
    await compare([
      ntnbPrincipalVerdict,
      { ...ntnbPrincipalVerdict, maturity: "2035-05-15", advantage: "-900.00" },
    ]);

    const panel = await verdictPanel();
    expect(
      within(panel).getByRole("heading", { name: "Amortizar rende mais que Tesouro IPCA+ 2032" }),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Amortizar termina com R$ 250,30 a mais")).toBeInTheDocument();
    expect(
      within(panel).getByText("2,5% dos R$ 10.000,00 em 5 anos e 10 meses."),
    ).toBeInTheDocument();
  });

  it("calls a near tie practically the same, and says so in practice", async () => {
    await compare([
      { ...ltnVerdict, advantage: "39.64", advantage_share: "0.0040", near_tie: true },
    ]);

    const panel = await verdictPanel();
    expect(
      within(panel).getByRole("heading", {
        name: "Investir em Tesouro Prefixado 2029 ou amortizar dá praticamente no mesmo",
      }),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Investir termina com R$ 39,64 a mais")).toBeInTheDocument();
    expect(
      within(panel).getByText("0,4% dos R$ 10.000,00 em 2 anos e 2 meses. Na prática, um empate."),
    ).toBeInTheDocument();
  });

  it("says both options end equal when the advantage is zero", async () => {
    await compare([
      { ...ltnVerdict, advantage: "-0.00", advantage_share: "0.0000", break_even_rate: "0.1276" },
    ]);

    const panel = await verdictPanel();
    expect(
      within(panel).getByRole("heading", {
        name: "Investir em Tesouro Prefixado 2029 ou amortizar dá no mesmo",
      }),
    ).toBeInTheDocument();
    expect(within(panel).getByText("As duas opções terminam iguais.")).toBeInTheDocument();
    expect(within(panel).queryByText(/ dos R\$ /)).toBeNull();
  });

  it("reads what an option leaves the owner with, not a negative amount", async () => {
    const owning = { ...invest, net_worth: "5000.00" };
    const owningNothing = { ...prepay, net_worth: "-0.00" };
    await compare([{ ...ltnVerdict, invest: owning, prepay: owningNothing }]);

    const panel = await verdictPanel();
    expect(outcome(panel, "Se investir").slice(2, 4)).toEqual(["No fim, você tem", "R$ 5.000,00"]);
    expect(outcome(panel, "Se amortizar").slice(2, 4)).toEqual(["No fim, você tem", "R$ 0,00"]);
  });

  it("says when the amount is for a later date than today", async () => {
    await compare([ltnVerdict], "10000", { date: "2026-12-01" });

    const panel = await verdictPanel();
    expect(outcome(panel, "Se amortizar")[1]).toBe("R$ 10.000,00 em 01/12/2026");
  });

  it("notes the market data the verdict reads that is not fresh", async () => {
    const stale: VerdictMarketData = {
      ...freshMarketData,
      bonds: { status: "stale", refreshed_at: "2026-10-23T09:05:00Z" },
    };
    await compare([{ ...ltnVerdict, market_data: stale }]);

    await verdictPanel();
    expect(screen.getByText("Preços dos títulos de 23/10.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atualizar" })).toBeInTheDocument();
  });

  it("names the projection method of each index, or says only published values were read", async () => {
    await compare([
      {
        ...ltnVerdict,
        projected_by: [
          { index: "ipca", method: "focus" },
          { index: "selic", method: "trailing_12" },
        ],
      },
    ]);

    await verdictPanel();
    expect(
      screen.getByText(
        "Na projeção atual: IPCA: Mediana do Focus (BCB); Selic diária: Média dos últimos 12 meses. O DebtWise compara; a decisão é sua.",
      ),
    ).toBeInTheDocument();
  });
});

describe("the other bonds", () => {
  const ltn2031: Verdict = { ...ltnVerdict, maturity: "2031-01-01", advantage: "80.00" };
  const tooSmall: Verdict = {
    type: "ntn_f",
    maturity: "2035-01-01",
    rate: "0.1391",
    unit_price: "880.50",
    quantity: "0.00",
    unavailable: "amount_too_small",
    minimum_amount: "8.81",
    projected_by: [],
    market_data: freshMarketData,
  };
  const missingIpca: Verdict = {
    type: "ntn_b_principal",
    maturity: "2035-05-15",
    rate: "0.0688",
    unavailable: "missing_ipca",
    projected_by: [],
    market_data: freshMarketData,
  };

  it("ranks the others by their advantage in words, then those with no comparison, why and what to try", async () => {
    await compare([missingIpca, ntnbPrincipalVerdict, tooSmall, ltn2031, ltnVerdict]);

    await verdictPanel();
    expect(rows(otherBonds())).toEqual([
      ["Tesouro Prefixado 2031 · 12,76%", "R$ 80,00 a mais"],
      ["Tesouro IPCA+ 2032 · IPCA + 6,72%", "R$ 250,30 a menos"],
      [
        "Tesouro IPCA+ 2035 · IPCA + 6,88%",
        "Depende de um IPCA que ainda não foi divulgado nem pode ser projetado.",
        "Ver projeções do IPCA",
        "Aguardando o IPCA",
      ],
      [
        "Tesouro Prefixado com Juros Semestrais 2035 · 13,91%",
        "Compra a partir de R$ 8,81.",
        "Usar R$ 8,81",
        "Valor pequeno demais",
      ],
    ]);
    expect(
      within(otherBonds()).getByRole("link", { name: "Ver projeções do IPCA" }),
    ).toHaveAttribute("href", "/mercado/indices/ipca");
  });

  it("compares the least amount that buys a bond the owner's amount is too small for", async () => {
    const requests = await compare([tooSmall, ltnVerdict]);
    await verdictPanel();

    fireEvent.click(within(otherBonds()).getByRole("button", { name: /^Usar R\$\s8,81$/ }));

    await screen.findByDisplayValue("8,81");
    expect(asked(requests)).toEqual([
      { amount: "10000", effect: "shorten_term" },
      { amount: "8.81", effect: "shorten_term" },
    ]);
  });

  it("puts the bond the owner picks on the verdict panel", async () => {
    await compare([ntnbPrincipalVerdict, ltnVerdict]);
    await verdictPanel();

    fireEvent.click(within(otherBonds()).getByRole("button", { name: /Tesouro IPCA\+ 2032/ }));

    const panel = screen.getByRole("region", {
      name: "Amortizar rende mais que Tesouro IPCA+ 2032",
    });
    expect(within(panel).getByText("Amortizar termina com R$ 250,30 a mais")).toBeInTheDocument();
    expect(rows(otherBonds())).toEqual([["Tesouro Prefixado 2029 · 12,76%", "R$ 1.234,56 a mais"]]);
  });

  it("leaves the list out when the panel holds the only bond", async () => {
    await compare([ltnVerdict]);

    await verdictPanel();
    expect(screen.queryByRole("region", { name: "Outros títulos" })).toBeNull();
  });
});

const cashFlowInvestHeader = [
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
  "Pagamento do título",
  "Bruto",
  "IR",
  "Taxa de custódia",
  "Líquido",
  "Saldo devedor",
];

const cashFlowPrepayHeader = [
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
  "Amortização extraordinária",
  "Saldo devedor",
];

/** What a scenario's section says under its title: each term and what it reads. */
const standings = (section: HTMLElement) =>
  Array.from(section.querySelectorAll("dt, dd")).map(text);

describe("the details of the verdict on the panel", () => {
  it("lists the purchase and what prepaying avoids", async () => {
    await compare([ltnVerdict]);
    await verdictPanel();

    const details = screen.getByRole("region", { name: "Detalhes" });
    expect(rows(details)).toEqual([
      ["Taxa de hoje", "12,76%"],
      ["Preço do título", "R$ 771,26"],
      ["Quantidade", "12,96"],
      ["Custo evitado ao amortizar", "R$ 456,78"],
    ]);
  });

  it("writes every rate with at most two places, the way Tesouro quotes it", async () => {
    await compare([
      { ...ltnVerdict, rate: "0.150678", break_even_rate: "0.139866" },
      { ...ntnbPrincipalVerdict, rate: "0.0672349" },
    ]);
    await verdictPanel();

    const details = screen.getByRole("region", { name: "Detalhes" });
    expect(rows(details)[0]).toEqual(["Taxa de hoje", "15,07%"]);
    expect(
      within(details).getByText("Empata com amortizar se a taxa cair para 13,99%."),
    ).toBeInTheDocument();
    expect(rows(otherBonds())).toEqual([
      ["Tesouro IPCA+ 2032 · IPCA + 6,72%", "R$ 250,30 a menos"],
    ]);
  });

  it("says at which rate prepaying would tie with investing when it wins", async () => {
    await compare([ntnbPrincipalVerdict]);
    await verdictPanel();

    expect(
      within(screen.getByRole("region", { name: "Detalhes" })).getByText(
        "Empata com amortizar se a taxa subir para IPCA + 7,12%.",
      ),
    ).toBeInTheDocument();
  });

  it("says the rate of today ties when the advantage is zero", async () => {
    await compare([
      {
        ...ltnVerdict,
        advantage: "-0.00",
        advantage_share: "0.0000",
        break_even_rate: "0.1276000000",
      },
    ]);
    await verdictPanel();

    expect(
      within(screen.getByRole("region", { name: "Detalhes" })).getByText(
        "A taxa de hoje, 12,76%, empata com amortizar.",
      ),
    ).toBeInTheDocument();
  });

  it.each([
    ["below_range", "Investir rende mais mesmo a 0,00% ao ano."],
    ["above_range", "Amortizar rende mais mesmo a 100,00% ao ano."],
  ] as const)("says why no rate breaks even when it is %s", async (reason, note) => {
    await compare([{ ...ltnVerdict, break_even_rate: undefined, no_break_even: reason }]);
    await verdictPanel();

    const details = screen.getByRole("region", { name: "Detalhes" });
    expect(within(details).getByText(note)).toBeInTheDocument();
    expect(within(details).queryByText(/^Empata/)).toBeNull();
  });

  it("opens, for investing and for prepaying, where the option ends and every cash flow with only the columns that have something", async () => {
    await compare([ltnVerdict]);
    await verdictPanel();
    expect(screen.queryByRole("table")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Ver cenários" }));

    const investing = screen.getByRole("region", { name: "Investir" });
    expect(standings(investing)).toEqual([
      "No fim",
      "Você deve R$ 138.123,00",
      "Saldo devedor",
      "R$ 151.000,00",
    ]);
    expect(
      rowTexts(within(investing).getByRole("table", { name: "Fluxo de caixa de Investir" })),
    ).toEqual([
      cashFlowInvestHeader,
      ["27/10/2026", ...dash(9), "R$ 10.000,00", ...dash(5), "R$ 190.000,00"],
      [
        "05/11/2026",
        "2",
        "IPCA 0,43%",
        "R$ 310,25",
        "R$ 1.500,10",
        "R$ 800,40",
        "R$ 45,00",
        "R$ 30,00",
        "R$ 25,00",
        "R$ 2.710,75",
        "R$ 0,00",
        ...dash(5),
        "R$ 189.199,60",
      ],
      [
        "01/01/2029",
        ...dash(9),
        "R$ 0,00",
        "Resgate",
        "R$ 13.500,00",
        "R$ 525,00",
        "R$ 98,00",
        "R$ 12.877,00",
        "R$ 151.000,00",
      ],
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
    const prepaying = screen.getByRole("region", { name: "Amortizar" });
    expect(standings(prepaying)).toEqual([
      "No fim",
      "Você deve R$ 139.357,56",
      "Saldo devedor",
      "R$ 150.000,00",
    ]);
    expect(within(prepaying).queryByRole("table", { name: /^Valor no vencimento/ })).toBeNull();
    expect(
      rowTexts(within(prepaying).getByRole("table", { name: "Fluxo de caixa de Amortizar" })),
    ).toEqual([
      cashFlowPrepayHeader,
      ["27/10/2026", ...dash(9), "R$ 10.000,00", "R$ 180.000,00"],
      [
        "05/11/2026",
        "2",
        "IPCA 0,43%",
        "R$ 293,98",
        "R$ 1.421,14",
        "R$ 800,40",
        "R$ 42,60",
        "R$ 30,00",
        "R$ 25,00",
        "R$ 2.613,12",
        "R$ 0,00",
        "R$ 179.493,30",
      ],
      ["01/01/2029", ...dash(9), "R$ 0,00", "R$ 150.000,00"],
    ]);
    expect(screen.getByRole("region", { name: "Detalhes" }).textContent).not.toMatch(/[-−]\s?R\$/);

    fireEvent.click(screen.getByRole("button", { name: "Ocultar cenários" }));
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("reads what a scenario leaves in words when the owner has it", async () => {
    await compare([{ ...ltnVerdict, invest: { ...invest, net_worth: "5000.00" } }]);
    await verdictPanel();

    fireEvent.click(screen.getByRole("button", { name: "Ver cenários" }));

    expect(standings(screen.getByRole("region", { name: "Investir" }))[1]).toBe(
      "Você tem R$ 5.000,00",
    );
  });

  describe("a projected index", () => {
    const projectedTr: CorrectionIndex = {
      index: "tr",
      status: "projected",
      value: "0.1617",
      period_start: "2026-11-15",
      period_end: "2026-12-15",
      methods: [{ index: "tr", method: "trailing_12" }],
    };
    const withProjectedTr: Scenario = {
      ...invest,
      cash_flows: investFlows.map((flow) =>
        flow.installment
          ? { ...flow, installment: { ...flow.installment, index_values: [projectedTr] } }
          : flow,
      ),
    };

    it("says in two plain sentences how it is projected and that projected values are grey", async () => {
      await compare([{ ...ltnVerdict, invest: withProjectedTr }]);
      await verdictPanel();

      fireEvent.click(screen.getByRole("button", { name: "Ver cenários" }));

      const investing = screen.getByRole("region", { name: "Investir" });
      expect(
        within(investing).getByText(
          "Taxa TR projetada pela média dos últimos 12 meses a partir de 15/11/2026.",
        ),
      ).toBeInTheDocument();
      expect(
        within(investing).getByText("Os valores projetados aparecem em cinza."),
      ).toBeInTheDocument();
      const prepaying = screen.getByRole("region", { name: "Amortizar" });
      expect(within(prepaying).queryByText("Os valores projetados aparecem em cinza.")).toBeNull();
    });

    it("opens, when tapped, the period it was projected for", async () => {
      await compare([{ ...ltnVerdict, invest: withProjectedTr }]);
      await verdictPanel();
      fireEvent.click(screen.getByRole("button", { name: "Ver cenários" }));
      const reading =
        "Taxa TR projetada pela média dos últimos 12 meses no período de 15/11/2026 a 15/12/2026.";
      expect(screen.queryByText(reading)).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "TR 0,1617%" }));

      expect(await screen.findByText(reading)).toBeInTheDocument();
    });
  });

  it("shows each coupon of the bond with its taxes, prepaid on its date, and marks a projected one", async () => {
    const coupon = (net: string, projected: boolean) => ({
      gross: "296.41",
      iof: "0.00",
      income_tax: "61.13",
      custody_fee: "5.85",
      net,
      projected_by: projected ? [{ index: "ipca" as const, method: "focus" as const }] : [],
    });
    await compare([
      {
        ...ntnbPrincipalVerdict,
        type: "ntn_b",
        maturity: "2037-05-15",
        invest: {
          ...invest,
          cash_flows: [
            {
              date: "2026-11-15",
              invested: "0.00",
              coupon: coupon("229.43", false),
              prepaid: "229.43",
              held: "0.00",
              outstanding_balance: "188970.17",
              net_worth: "-178000.00",
            },
            {
              date: "2027-05-15",
              invested: "0.00",
              coupon: coupon("229.43", true),
              prepaid: "0.00",
              held: "229.43",
              outstanding_balance: "0.00",
              net_worth: "10229.43",
            },
          ],
        },
      },
    ]);
    await verdictPanel();
    fireEvent.click(screen.getByRole("button", { name: "Ver cenários" }));

    const investing = screen.getByRole("region", { name: "Investir" });
    const couponCells = ["Cupom", "R$ 296,41", "R$ 61,13", "R$ 5,85", "R$ 229,43"];
    expect(
      rowTexts(within(investing).getByRole("table", { name: "Fluxo de caixa de Investir" })),
    ).toEqual([
      [
        "Data",
        "Amortização extraordinária",
        "Pagamento do título",
        "Bruto",
        "IR",
        "Taxa de custódia",
        "Líquido",
        "Projeção",
        "Saldo devedor",
      ],
      ["15/11/2026", "R$ 229,43", ...couponCells, "—", "R$ 188.970,17"],
      ["15/05/2027", "R$ 0,00", ...couponCells, "ProjetadoIPCA: Mediana do Focus (BCB)", "R$ 0,00"],
    ]);
  });
});

describe("a decision that compares no bond", () => {
  const tooSmall = (type: Verdict["type"], minimum: string): Verdict => ({
    type,
    maturity: "2029-01-01",
    rate: "0.1391",
    unit_price: "880.50",
    quantity: "0.00",
    unavailable: "amount_too_small",
    minimum_amount: minimum,
    projected_by: [],
    market_data: freshMarketData,
  });

  it("offers the least amount that buys a bond when the amount is too small, and compares it", async () => {
    let calls = 0;
    const requests = stubDecisions(() =>
      Response.json(
        calls++ === 0
          ? decisionOf([tooSmall("ntn_f", "10.40"), tooSmall("ltn", "8.81")], { amount: "5.00" })
          : decisionOf([ltnVerdict]),
      ),
    );
    renderAt("/comparar");
    await sentence();
    fill("Valor", "5");
    fireEvent.click(screen.getByRole("button", { name: "Comparar" }));

    const panel = await screen.findByRole("region", { name: "Valor pequeno demais para comparar" });
    expect(
      within(panel).getByText(
        "O Tesouro Direto vende a partir de um centésimo do título, e o valor não compra isso de nenhum deles. Tente um valor a partir de R$ 8,81.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: /^Usar R\$\s8,81$/ }));

    await verdictPanel();
    expect(screen.getByLabelText("Valor")).toHaveValue("8,81");
    expect(asked(requests)).toEqual([
      { amount: "5", effect: "shorten_term" },
      { amount: "8.81", effect: "shorten_term" },
    ]);
  });

  it("explains a missing IPCA and points to its projections", async () => {
    await compare([
      {
        type: "ntn_b_principal",
        maturity: "2035-05-15",
        rate: "0.0688",
        unavailable: "missing_ipca",
        projected_by: [],
        market_data: freshMarketData,
      },
    ]);

    const panel = await screen.findByRole("region", { name: "Aguardando o IPCA" });
    expect(
      within(panel).getByText(
        "A comparação depende de um número-índice do IPCA que ainda não foi divulgado nem pode ser projetado.",
      ),
    ).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Ver projeções do IPCA" })).toHaveAttribute(
      "href",
      "/mercado/indices/ipca",
    );
  });

  it("says no bond on offer follows the indexer of the mortgage, and points to those on offer", async () => {
    await compare([]);

    const panel = await screen.findByRole("region", { name: "Nenhum título para comparar" });
    expect(
      within(panel).getByText(
        "Nenhum título à venda acompanha o indexador do seu financiamento e vence depois da data escolhida.",
      ),
    ).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Ver títulos à venda" })).toHaveAttribute(
      "href",
      "/mercado/titulos",
    );
  });
});

describe("a decision the server rejects", () => {
  it("names the rule each rejected value breaks under the sentence", async () => {
    stubDecisions(() =>
      problem(422, "Unprocessable Entity", "validation failed", [
        { location: "body.amount", message: "must be greater than zero", code: "not_positive" },
        { location: "body.date", message: "must not be before today", code: "before_today" },
      ]),
    );
    renderAt("/comparar");
    await sentence();
    fill("Valor", "0");
    fireEvent.click(screen.getByRole("button", { name: "Comparar" }));

    await screen.findByText("A data não pode ser antes de hoje.");
    expect(screen.getByLabelText("Valor")).toHaveAccessibleDescription(
      "Informe um valor maior que zero.",
    );
    expect(screen.getByLabelText("Valor")).toBeInvalid();
    expect(screen.getByRole("button", { name: "Data: hoje" })).toHaveAccessibleDescription(
      "A data não pode ser antes de hoje.",
    );
    expect(screen.getByLabelText("Efeito")).toBeValid();
  });

  it("explains an amount the schema rejects by its field", async () => {
    stubDecisions(() =>
      problem(422, "Unprocessable Entity", "validation failed", [
        { location: "body.amount", message: "expected string to match pattern" },
      ]),
    );
    renderAt("/comparar");
    await sentence();
    fill("Valor", "abc");
    fireEvent.click(screen.getByRole("button", { name: "Comparar" }));

    expect(
      await screen.findByText("Informe um valor em reais, com até 2 casas decimais."),
    ).toBeInTheDocument();
  });

  it("offers to try again when the comparison fails, with the same question", async () => {
    let calls = 0;
    const requests = stubDecisions(() =>
      calls++ === 0
        ? problem(500, "Internal Server Error", "boom")
        : Response.json(decisionOf([ltnVerdict])),
    );
    renderAt("/comparar");
    await sentence();
    fill("Valor", "10000");
    fireEvent.click(screen.getByRole("button", { name: "Comparar" }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Não foi possível comparar")).toBeInTheDocument();
    fireEvent.click(within(alert).getByRole("button", { name: "Tentar novamente" }));

    await verdictPanel();
    expect(asked(requests)).toEqual([
      { amount: "10000", effect: "shorten_term" },
      { amount: "10000", effect: "shorten_term" },
    ]);
  });
});
