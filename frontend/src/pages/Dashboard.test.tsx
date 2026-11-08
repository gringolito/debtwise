import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CashFlow,
  EarlySaleCheck,
  Lot,
  LotAmount,
  LotValued,
  MarketDataStatus,
  Prepayment,
  Scenario,
  StatementDrift,
  Verdict,
  VerdictMarketData,
} from "@/lib/api";
import { text } from "@/test/dom";
import { registeredMortgage, schedule } from "@/test/mortgageFixtures";
import { renderAt } from "@/test/renderAt";
import { problem, stubRoutes } from "@/test/stubServer";

type Routes = Parameters<typeof stubRoutes>[0];

const FRESH_STATUS: MarketDataStatus = {
  refreshing: false,
  indexes: [{ index: "tr", status: "fresh", refreshed_at: "2024-03-19T18:23:39Z" }],
  bonds: { status: "fresh", refreshed_at: "2024-03-19T18:24:00Z" },
  focus: { status: "fresh", refreshed_at: "2024-03-19T18:24:30Z" },
};

const freshMarketData: VerdictMarketData = {
  bonds: FRESH_STATUS.bonds,
  focus: FRESH_STATUS.focus,
  indexes: FRESH_STATUS.indexes,
};

const flow = (date: string, outstanding_balance: string): CashFlow => ({
  date,
  invested: "0.00",
  prepaid: "0.00",
  held: "0.00",
  outstanding_balance,
});

const scenario: Scenario = {
  net_worth: "0.00",
  cash: "0.00",
  outstanding_balance: "0.00",
  cash_flows: [flow("2024-03-20", "30000.00"), flow("2029-01-01", "0.00")],
};

const ltn: Verdict = {
  type: "ltn",
  maturity: "2029-01-01",
  rate: "0.1276",
  unit_price: "771.26",
  quantity: "12.96",
  advantage: "1234.56",
  avoided_cost: "456.78",
  break_even_rate: "0.1102",
  invest: scenario,
  prepay: scenario,
  projected_by: [],
  market_data: freshMarketData,
};
const ntnf: Verdict = { ...ltn, type: "ntn_f", maturity: "2035-01-01", advantage: "-250.30" };
const unavailable: Verdict = {
  type: "ntn_f",
  maturity: "2031-01-01",
  rate: "0.13",
  unavailable: "amount_too_small",
  projected_by: [],
  market_data: freshMarketData,
};

const decisionOf = (verdicts: Verdict[]) => () =>
  Response.json({ amount: "10000.00", date: "2024-03-20", effect: "shorten_term", verdicts });

const MARKET: LotAmount = {
  gross: "900.00",
  iof: "0.00",
  income_tax: "17.50",
  custody_fee: "0.00",
  net: "882.50",
  projected_by: [],
};

const quotedLot: LotValued = {
  id: 1,
  type: "ltn",
  maturity: "2026-01-01",
  purchase_date: "2022-01-03",
  rate: "0.1",
  unit_price: "800.00",
  quantity: "1",
  values: { on: "2024-03-20", market: MARKET, maturity: MARKET, coupons: [] },
};

const statement: StatementDrift = {
  id: 4,
  date: "2024-02-15",
  outstanding_balance: "40000.42",
  computed_balance: "40000.00",
  drift: "0.42",
  within_rounding: false,
};

const prepayment: Prepayment = {
  id: 9,
  date: "2024-03-02",
  amount: "15000.00",
  effect: "shorten_term",
};

// Answers every endpoint Início reads for an owner who set up the mortgage and recorded nothing
// else, with no bond to compare, unless a test answers an endpoint itself.
function stubInicio(routes: Routes = {}) {
  return stubRoutes({
    "GET /api/mortgage": () => Response.json(registeredMortgage),
    "GET /api/mortgage/schedule": () => Response.json(schedule),
    "GET /api/mortgage/statements": () => Response.json({ statements: [] }),
    "GET /api/mortgage/prepayments": () => Response.json({ prepayments: [] }),
    "GET /api/lots": () => Response.json({ lots: [] }),
    "GET /api/early-sale-checks": () =>
      Response.json({ date: "2024-03-20", effect: "shorten_term", checks: [] }),
    "GET /api/market-data/status": () => Response.json(FRESH_STATUS),
    "POST /api/decisions": decisionOf([]),
    ...routes,
  });
}

const region = (name: string | RegExp) => screen.findByRole("region", { name });
const answerCard = () => region(/rende mais|dá no mesmo|Amortizar ou investir\?/);

/** paragraph finds the paragraph that reads content, across the elements it is split into. */
const paragraph = (container: HTMLElement, content: string) =>
  within(container).getByText(
    (_, element) => element?.tagName === "P" && text(element) === content,
  );

/** words is what a row shows, a space between each of its texts as the layout sets them apart. */
const words = (element: Element) =>
  Array.from(element.querySelectorAll("*"))
    .filter((child) => child.children.length === 0 && text(child) !== "")
    .map(text)
    .join(" ");

const linkNamed = (container: HTMLElement, name: string) =>
  within(container)
    .getAllByRole("link")
    .find((link) => text(link) === name);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2024, 2, 20, 9, 30));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Início", () => {
  it("dates the page today and no longer shows the server health or a decision form", async () => {
    const requests = stubInicio();
    renderAt("/");

    await answerCard();
    expect(screen.getByRole("heading", { level: 1, name: "Início" })).toBeInTheDocument();
    expect(screen.getByText("Quarta-feira, 20 de março")).toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(requests.map((r) => new URL(r.url).pathname)).not.toContain("/api/health");
  });

  it("shows the skeleton while it loads", async () => {
    stubInicio({ "GET /api/lots": () => new Promise<Response>(() => {}) });
    renderAt("/");

    expect(await screen.findByRole("status", { name: "Carregando início" })).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("shows the error panel when something fails to load, and retries it", async () => {
    let failing = true;
    stubInicio({
      "GET /api/mortgage/statements": () =>
        failing
          ? problem(500, "Internal Server Error", "boom")
          : Response.json({ statements: [statement] }),
    });
    renderAt("/");

    const panel = await screen.findByRole("alert");
    expect(panel).toHaveTextContent("Não foi possível carregar o início");
    failing = false;
    fireEvent.click(within(panel).getByRole("button", { name: "Tentar novamente" }));

    expect(await region("Atividade recente")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("the answer card", () => {
  it("states the verdict of the highest advantage for R$ 10.000,00 prepaid today to shorten the term", async () => {
    const requests = stubInicio({ "POST /api/decisions": decisionOf([ntnf, unavailable, ltn]) });
    renderAt("/");

    const card = await answerCard();
    expect(
      within(card).getByRole("heading", { name: "Investir em Tesouro Prefixado 2029 rende mais" }),
    ).toBeInTheDocument();
    expect(within(card).getByText("Na projeção atual, para R$ 10.000,00 hoje")).toBeInTheDocument();
    expect(
      paragraph(card, "R$ 1.234,56 a mais do que amortizar, até 01/01/2029."),
    ).toBeInTheDocument();
    expect(
      requests.filter((r) => r.method === "POST").map((r) => [new URL(r.url).pathname, r.body]),
    ).toEqual([["/api/decisions", { amount: "10000.00", effect: "shorten_term" }]]);
  });

  it("links to Decidir with the amount prefilled, comparing it at once or to change it", async () => {
    stubInicio({ "POST /api/decisions": decisionOf([ltn]) });
    renderAt("/");

    const card = await answerCard();
    expect(within(card).getByRole("link", { name: "Ver comparação" })).toHaveAttribute(
      "href",
      "/decidir?valor=10000&comparar=true",
    );
    expect(within(card).getByRole("link", { name: "Mudar valor" })).toHaveAttribute(
      "href",
      "/decidir?valor=10000",
    );
  });

  it("tells apart advantages a cent apart however large", async () => {
    stubInicio({
      "POST /api/decisions": decisionOf([
        { ...ltn, advantage: "100000000000000.01" },
        { ...ntnf, advantage: "100000000000000.02" },
      ]),
    });
    renderAt("/");

    const card = await answerCard();
    expect(
      within(card).getByRole("heading", {
        name: "Investir em Tesouro Prefixado com Juros Semestrais 2035 rende mais",
      }),
    ).toBeInTheDocument();
  });

  it("states prepaying when every advantage favours it, against the bond it beats by least", async () => {
    stubInicio({ "POST /api/decisions": decisionOf([{ ...ltn, advantage: "-900.00" }, ntnf]) });
    renderAt("/");

    const card = await answerCard();
    expect(within(card).getByRole("heading", { name: "Amortizar rende mais" })).toBeInTheDocument();
    expect(
      paragraph(
        card,
        "R$ 250,30 a mais do que investir em Tesouro Prefixado com Juros Semestrais 2035, até 01/01/2035.",
      ),
    ).toBeInTheDocument();
  });

  it.each([
    ["no bond follows the mortgage's indexer", []],
    ["no verdict is available", [unavailable]],
  ])("invites a comparison when %s", async (_, verdicts) => {
    stubInicio({ "POST /api/decisions": decisionOf(verdicts) });
    renderAt("/");

    const card = await answerCard();
    expect(
      within(card).getByRole("heading", { name: "Amortizar ou investir? Veja a comparação." }),
    ).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Comparar agora" })).toHaveAttribute(
      "href",
      "/decidir?valor=10000&comparar=true",
    );
    expect(within(card).queryByRole("link", { name: "Mudar valor" })).not.toBeInTheDocument();
  });

  it.each(["0.00", "-0.00"])(
    "says both options come out the same when the advantage is %s",
    async (advantage) => {
      stubInicio({ "POST /api/decisions": decisionOf([{ ...ltn, advantage }]) });
      renderAt("/");

      const card = await answerCard();
      expect(
        within(card).getByRole("heading", {
          name: "Investir em Tesouro Prefixado 2029 ou amortizar dá no mesmo",
        }),
      ).toBeInTheDocument();
      expect(paragraph(card, "Nenhuma diferença até 01/01/2029.")).toBeInTheDocument();
    },
  );
});

describe("the stale-data note", () => {
  const staleVerdict: Verdict = {
    ...ltn,
    market_data: {
      bonds: { status: "stale", refreshed_at: "2024-03-15T18:24:00Z" },
      focus: { status: "missing" },
      indexes: [
        { index: "tr", status: "fresh", refreshed_at: "2024-03-19T18:23:39Z" },
        { index: "ipca", status: "failed", refreshed_at: "2024-03-01T12:00:00Z" },
      ],
    },
  };
  const note = (card: HTMLElement) => card.parentElement?.querySelector(":scope > p");

  it("names each source the answer reads that is not fresh, directly under the card", async () => {
    stubInicio({ "POST /api/decisions": decisionOf([staleVerdict]) });
    renderAt("/");

    const card = await answerCard();
    expect(card.nextElementSibling).toBe(note(card));
    expect(text(card.nextElementSibling as Element)).toBe(
      "Preços dos títulos de 15/03. Expectativas do Focus indisponível. IPCA de 01/03. Atualizar",
    );
  });

  it("is absent while the market data the answer reads is fresh", async () => {
    stubInicio({ "POST /api/decisions": decisionOf([ltn]) });
    renderAt("/");

    const card = await answerCard();
    expect(card.nextElementSibling).toBeNull();
  });

  it("refreshes the market data and reads what depends on it again once the refresh ends", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2024, 2, 20, 9, 30));
    const statuses = [FRESH_STATUS, { ...FRESH_STATUS, refreshing: true }, FRESH_STATUS];
    let refreshed = false;
    const requests = stubInicio({
      "GET /api/market-data/status": () => Response.json(statuses.shift() ?? FRESH_STATUS),
      "POST /api/market-data/refresh": () => {
        refreshed = true;
        return Response.json({ ...FRESH_STATUS, refreshing: true });
      },
      "POST /api/decisions": () => decisionOf([refreshed ? ltn : staleVerdict])(),
      "GET /api/lots": () =>
        Response.json({
          lots: [quotedLot],
          market_value: refreshed
            ? { gross: "960.00", net: "950.00" }
            : { gross: "900.00", net: "882.50" },
        }),
    });
    renderAt("/");

    const card = await answerCard();
    fireEvent.click(
      within(card.parentElement as HTMLElement).getByRole("button", { name: "Atualizar" }),
    );
    expect(await screen.findByText("Atualizando…")).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(4000);

    await waitFor(() => expect(card.nextElementSibling).toBeNull());
    expect(await within(await region("Investimentos")).findByText("R$ 950,00")).toBeInTheDocument();
    const reads = (path: string) => requests.filter((r) => new URL(r.url).pathname === path).length;
    expect(
      ["/api/decisions", "/api/mortgage/schedule", "/api/lots", "/api/early-sale-checks"].map(
        reads,
      ),
    ).toEqual([2, 2, 2, 2]);
  });
});

describe("the mortgage panel", () => {
  it("shows the balance after the latest installment due, the payoff month, the share paid and the next installment", async () => {
    stubInicio();
    renderAt("/");

    const mortgage = await region("Financiamento");
    expect(within(mortgage).getByText("R$ 30.000,00")).toBeInTheDocument();
    expect(within(mortgage).getByText("Quitação prevista em junho de 2024")).toBeInTheDocument();
    expect(within(mortgage).getByText("50% pago")).toBeInTheDocument();
    expect(linkNamed(mortgage, "Próxima prestação · 10/04 · R$ 10.337,50")).toHaveAttribute(
      "href",
      "/financiamento",
    );
  });

  it("counts an installment due today as paid", async () => {
    vi.setSystemTime(new Date(2024, 3, 10, 0, 5));
    stubInicio();
    renderAt("/");

    const mortgage = await region("Financiamento");
    expect(within(mortgage).getByText("R$ 20.000,00")).toBeInTheDocument();
    expect(within(mortgage).getByText("66% pago")).toBeInTheDocument();
  });

  it("reads today in the owner's time zone", async () => {
    vi.stubEnv("TZ", "America/Sao_Paulo");
    // Already 2024-04-10 in UTC, but still the evening of 2024-04-09 in São Paulo.
    vi.setSystemTime(new Date("2024-04-10T02:55:00Z"));
    stubInicio();
    renderAt("/");

    const mortgage = await region("Financiamento");
    expect(within(mortgage).getByText("R$ 30.000,00")).toBeInTheDocument();
  });

  it("owes the amount financed before the first installment is due", async () => {
    vi.setSystemTime(new Date(2024, 0, 9, 23, 55));
    stubInicio();
    renderAt("/");

    const mortgage = await region("Financiamento");
    expect(within(mortgage).getByText("R$ 60.000,00")).toBeInTheDocument();
    expect(within(mortgage).getByText("0% pago")).toBeInTheDocument();
    expect(linkNamed(mortgage, "Próxima prestação · 10/01 · R$ 10.640,50")).toBeInTheDocument();
  });

  it("owes nothing once the last installment is due", async () => {
    vi.setSystemTime(new Date(2024, 6, 1));
    stubInicio();
    renderAt("/");

    const mortgage = await region("Financiamento");
    expect(within(mortgage).getByText("R$ 0,00")).toBeInTheDocument();
    expect(within(mortgage).getByText("100% pago")).toBeInTheDocument();
    expect(within(mortgage).getByRole("link", { name: "Ver prestações" })).toHaveAttribute(
      "href",
      "/financiamento",
    );
  });
});

describe("the investments panel", () => {
  const sameBond: LotValued = { ...quotedLot, id: 2, purchase_date: "2023-05-02" };
  const unquoted: LotValued = {
    ...quotedLot,
    id: 3,
    type: "ntn_b_principal",
    maturity: "2035-05-15",
    values: undefined,
    values_unavailable: "missing_ipca",
  };
  const lot: Lot = {
    id: 1,
    type: "ltn",
    maturity: "2026-01-01",
    purchase_date: "2022-01-03",
    rate: "0.1",
    unit_price: "800.00",
    quantity: "1",
  };
  const checksOf = (checks: EarlySaleCheck[]) => () =>
    Response.json({ date: "2024-03-20", effect: "shorten_term", checks });

  it("shows the net market value, the lots and bonds held, and the lots left out of the total", async () => {
    stubInicio({
      "GET /api/lots": () =>
        Response.json({
          lots: [quotedLot, sameBond, unquoted],
          market_value: { gross: "1800.00", net: "1765.00" },
        }),
    });
    renderAt("/");

    const investments = await region("Investimentos");
    expect(within(investments).getByText("Valor de mercado líquido")).toBeInTheDocument();
    expect(within(investments).getByText("R$ 1.765,00")).toBeInTheDocument();
    expect(within(investments).getByText("3 compras · 2 títulos")).toBeInTheDocument();
    expect(
      within(investments).getByText("1 compra sem valor de mercado ficou fora do total."),
    ).toBeInTheDocument();
  });

  it("says no lot has a market value when none has", async () => {
    stubInicio({ "GET /api/lots": () => Response.json({ lots: [unquoted] }) });
    renderAt("/");

    const investments = await region("Investimentos");
    expect(
      within(investments).getByText("Nenhuma compra tem valor de mercado hoje."),
    ).toBeInTheDocument();
    expect(within(investments).getByText("1 compra · 1 título")).toBeInTheDocument();
  });

  it.each([
    [[], "Venda antecipada · Nenhuma vale a pena agora"],
    [["sell", "hold"], "Venda antecipada · 1 vale a pena agora"],
    [["sell", "sell"], "Venda antecipada · 2 valem a pena agora"],
  ] as const)("sums up the early sale checks %j", async (verdicts, summary) => {
    stubInicio({
      "GET /api/lots": () =>
        Response.json({ lots: [quotedLot], market_value: { gross: "900.00", net: "882.50" } }),
      "GET /api/early-sale-checks": checksOf(
        verdicts.map((verdict) => ({
          lot,
          verdict,
          advantage: verdict === "sell" ? "-10.00" : "10.00",
          projected_by: [],
          market_data: freshMarketData,
        })),
      ),
    });
    renderAt("/");

    const investments = await region("Investimentos");
    expect(await within(investments).findByRole("link", { name: summary })).toHaveAttribute(
      "href",
      "/investimentos/venda-antecipada",
    );
  });

  it("invites recording a lot while none is", async () => {
    stubInicio();
    renderAt("/");

    const investments = await region("Investimentos");
    expect(within(investments).getByRole("link", { name: "Adicionar compra" })).toHaveAttribute(
      "href",
      "/investimentos",
    );
    expect(within(investments).queryByText("Valor de mercado líquido")).not.toBeInTheDocument();
  });
});

describe("the next steps", () => {
  const steps = async () =>
    within(await region("Próximos passos"))
      .getAllByRole("listitem")
      .map((item) => [words(item), item.querySelector("a")?.getAttribute("href") ?? null]);

  it("marks the mortgage done and links to each step still to do", async () => {
    stubInicio();
    renderAt("/");

    expect(await steps()).toEqual([
      ["Configurar o financiamento Concluído", null],
      ["Registrar o último extrato do banco", "/financiamento"],
      ["Adicionar suas compras do Tesouro", "/investimentos"],
    ]);
  });

  it("marks the statement step done once a statement is recorded", async () => {
    stubInicio({
      "GET /api/mortgage/statements": () => Response.json({ statements: [statement] }),
    });
    renderAt("/");

    expect(await steps()).toEqual([
      ["Configurar o financiamento Concluído", null],
      ["Registrar o último extrato do banco Concluído", null],
      ["Adicionar suas compras do Tesouro", "/investimentos"],
    ]);
  });

  it("marks the lot step done once a lot is recorded", async () => {
    stubInicio({ "GET /api/lots": () => Response.json({ lots: [quotedLot] }) });
    renderAt("/");

    expect(await steps()).toEqual([
      ["Configurar o financiamento Concluído", null],
      ["Registrar o último extrato do banco", "/financiamento"],
      ["Adicionar suas compras do Tesouro Concluído", null],
    ]);
  });

  it("disappears once every step is done", async () => {
    stubInicio({
      "GET /api/mortgage/statements": () => Response.json({ statements: [statement] }),
      "GET /api/lots": () => Response.json({ lots: [quotedLot] }),
    });
    renderAt("/");

    await answerCard();
    expect(screen.queryByRole("region", { name: "Próximos passos" })).not.toBeInTheDocument();
  });
});

describe("the recent activity", () => {
  it("lists the latest three statements and prepayments, newest first", async () => {
    stubInicio({
      "GET /api/mortgage/statements": () =>
        Response.json({
          statements: [{ ...statement, id: 1, date: "2023-12-15", drift: "-1.00" }, statement],
        }),
      "GET /api/mortgage/prepayments": () =>
        Response.json({
          prepayments: [{ ...prepayment, id: 8, date: "2024-01-20", amount: "500.00" }, prepayment],
        }),
    });
    renderAt("/");

    const activity = await region("Atividade recente");
    const rows = within(activity).getAllByRole("link");
    expect(rows.map((row) => [words(row), row.getAttribute("href")])).toEqual([
      ["Amortização extraordinária 02/03/2024 R$ 15.000,00", "/financiamento"],
      ["Extrato registrado 15/02/2024 · diferença de R$ 0,42", "/financiamento"],
      ["Amortização extraordinária 20/01/2024 R$ 500,00", "/financiamento"],
    ]);
  });

  it("is absent while nothing is recorded", async () => {
    stubInicio();
    renderAt("/");

    await answerCard();
    expect(screen.queryByRole("region", { name: "Atividade recente" })).not.toBeInTheDocument();
  });
});
