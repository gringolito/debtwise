import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CashFlow,
  EarlySaleCheck,
  Lot,
  LotAmount,
  LotValued,
  MarketDataStatus,
  Scenario,
  Verdict,
} from "@/lib/api";
import { text } from "@/test/dom";
import { schedule } from "@/test/mortgageFixtures";
import { renderAt } from "@/test/renderAt";
import { problem, stubRoutes } from "@/test/stubServer";

type Routes = Parameters<typeof stubRoutes>[0];

const FRESH_STATUS: MarketDataStatus = {
  refreshing: false,
  indexes: [
    { index: "tr", status: "fresh", refreshed_at: "2024-03-19T18:23:39Z" },
    { index: "selic", status: "fresh", refreshed_at: "2024-03-19T18:23:42Z" },
  ],
  bonds: { status: "fresh", refreshed_at: "2024-03-19T18:24:00Z" },
  focus: { status: "fresh", refreshed_at: "2024-03-19T18:24:30Z" },
};

const MATURED: LotAmount = {
  gross: "1000.00",
  iof: "0.00",
  income_tax: "35.00",
  custody_fee: "0.00",
  net: "965.00",
  projected_by: [],
};

const MARKET: LotAmount = { ...MATURED, gross: "900.00", income_tax: "17.50", net: "882.50" };

const maturedLot: LotValued = {
  id: 1,
  type: "ltn",
  maturity: "2024-01-01",
  purchase_date: "2022-01-03",
  rate: "0.1",
  unit_price: "800.00",
  quantity: "1",
  values: { on: "2024-03-20", maturity: MATURED, coupons: [] },
};

// Answers every endpoint the dashboard reads for an owner who registered nothing yet, with the market
// data fresh, unless a test answers an endpoint itself.
function stubDashboard(routes: Routes = {}) {
  return stubRoutes({
    "GET /api/health": () => Response.json({ status: "ok" }),
    "GET /api/mortgage/schedule": () => problem(404, "Not Found", "no mortgage is registered"),
    "GET /api/lots": () => Response.json({ lots: [] }),
    "GET /api/early-sale-checks": () =>
      Response.json({ date: "2024-03-20", effect: "shorten_term", checks: [] }),
    "GET /api/market-data/status": () => Response.json(FRESH_STATUS),
    ...routes,
  });
}

const region = (name: string) => screen.findByRole("region", { name });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2024, 2, 20, 9, 30));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("a market-data refresh running when the dashboard opens", () => {
  it("reloads the figures that read market data once it ends", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2024, 2, 20, 9, 30));
    const statuses = [{ ...FRESH_STATUS, refreshing: true }, FRESH_STATUS];
    const requests = stubDashboard({
      "GET /api/market-data/status": () => Response.json(statuses.shift() ?? FRESH_STATUS),
      "GET /api/lots": () =>
        Response.json(
          statuses.length === 0
            ? { lots: [maturedLot], market_value: { gross: "900.00", net: "882.50" } }
            : { lots: [maturedLot] },
        ),
    });
    renderAt("/");

    const lots = await region("Lotes");
    expect(
      await within(lots).findByText("Nenhum lote tem valor de mercado hoje."),
    ).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(2000);

    expect(await within(lots).findByText("R$ 882,50")).toBeInTheDocument();
    const reads = (path: string) => requests.filter((r) => new URL(r.url).pathname === path).length;
    expect(["/api/mortgage/schedule", "/api/lots", "/api/early-sale-checks"].map(reads)).toEqual([
      2, 2, 2,
    ]);
  });
});

describe("the mortgage on the dashboard", () => {
  it("shows the balance after the latest installment due and the last installment's date", async () => {
    stubDashboard({ "GET /api/mortgage/schedule": () => Response.json(schedule) });
    renderAt("/");

    const mortgage = await region("Financiamento");
    await within(mortgage).findByText("Quitação prevista");
    expect(
      within(mortgage)
        .getAllByRole("listitem")
        .map((item) => text(item)),
    ).toEqual([
      "Saldo devedor R$ 30.000,00 após a parcela 3, de 10/03/2024",
      "Quitação prevista 10/06/2024",
    ]);
  });

  it("counts an installment due today as paid", async () => {
    vi.setSystemTime(new Date(2024, 3, 10, 0, 5));
    stubDashboard({ "GET /api/mortgage/schedule": () => Response.json(schedule) });
    renderAt("/");

    const mortgage = await region("Financiamento");
    expect(
      await within(mortgage).findByText("R$ 20.000,00 após a parcela 4, de 10/04/2024"),
    ).toBeInTheDocument();
  });

  it("reads today in the owner's time zone", async () => {
    vi.stubEnv("TZ", "America/Sao_Paulo");
    // Already 2024-04-10 in UTC, but still the evening of 2024-04-09 in São Paulo.
    vi.setSystemTime(new Date("2024-04-10T02:55:00Z"));
    stubDashboard({ "GET /api/mortgage/schedule": () => Response.json(schedule) });
    renderAt("/");

    const mortgage = await region("Financiamento");
    expect(
      await within(mortgage).findByText("R$ 30.000,00 após a parcela 3, de 10/03/2024"),
    ).toBeInTheDocument();
  });

  it("says no installment is due yet before the first one", async () => {
    vi.setSystemTime(new Date(2024, 0, 9, 23, 55));
    stubDashboard({ "GET /api/mortgage/schedule": () => Response.json(schedule) });
    renderAt("/");

    const mortgage = await region("Financiamento");
    expect(await within(mortgage).findByText("Nenhuma parcela venceu ainda.")).toBeInTheDocument();
    expect(within(mortgage).getByText("10/06/2024")).toBeInTheDocument();
  });

  it("links to registering a mortgage while none is", async () => {
    stubDashboard();
    renderAt("/");

    const mortgage = await region("Financiamento");
    expect(
      await within(mortgage).findByRole("link", { name: "Cadastrar financiamento" }),
    ).toHaveAttribute("href", "/financiamento/editar");
  });

  it("says the schedule could not be loaded", async () => {
    stubDashboard({
      "GET /api/mortgage/schedule": () => problem(500, "Internal Server Error", "boom"),
    });
    renderAt("/");

    const mortgage = await region("Financiamento");
    expect(await within(mortgage).findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar o financiamento.",
    );
  });
});

describe("the lots on the dashboard", () => {
  it("shows the total Market Value of the lots, gross and net", async () => {
    const quoted: LotValued = {
      ...maturedLot,
      id: 2,
      maturity: "2026-01-01",
      values: { on: "2024-03-20", market: MARKET, maturity: MATURED, coupons: [] },
    };
    stubDashboard({
      "GET /api/lots": () =>
        Response.json({
          lots: [maturedLot, quoted],
          market_value: { gross: "9120.00", net: "8958.00" },
        }),
    });
    renderAt("/");

    const lots = await region("Lotes");
    await within(lots).findByText("Valor de mercado líquido");
    expect(
      within(lots)
        .getAllByRole("listitem")
        .map((item) => text(item)),
    ).toEqual(["Valor de mercado líquido R$ 8.958,00", "Valor de mercado bruto R$ 9.120,00"]);
  });

  it("links to recording a lot while none is", async () => {
    stubDashboard();
    renderAt("/");

    const lots = await region("Lotes");
    expect(await within(lots).findByRole("link", { name: "Registrar lote" })).toHaveAttribute(
      "href",
      "/lotes",
    );
  });

  it("says no lot has a Market Value when the recorded ones have none", async () => {
    stubDashboard({ "GET /api/lots": () => Response.json({ lots: [maturedLot] }) });
    renderAt("/");

    const lots = await region("Lotes");
    expect(
      await within(lots).findByText("Nenhum lote tem valor de mercado hoje."),
    ).toBeInTheDocument();
  });

  it("says how many lots held to maturity the total leaves out for having no Market Value", async () => {
    const quoted: LotValued = {
      ...maturedLot,
      id: 2,
      maturity: "2026-01-01",
      values: { on: "2024-03-20", market: MARKET, maturity: MATURED, coupons: [] },
    };
    const unquoted: LotValued = {
      ...quoted,
      id: 3,
      values: { on: "2024-03-20", accrual: MARKET, maturity: MATURED, coupons: [] },
    };
    const missingIPCA: LotValued = {
      ...maturedLot,
      id: 4,
      type: "ntn_b_principal",
      maturity: "2035-05-15",
      values: undefined,
      values_unavailable: "missing_ipca",
    };
    stubDashboard({
      "GET /api/lots": () =>
        Response.json({
          lots: [maturedLot, quoted, unquoted, missingIPCA],
          market_value: { gross: "900.00", net: "882.50" },
        }),
    });
    renderAt("/");

    const lots = await region("Lotes");
    expect(
      await within(lots).findByText("2 lotes sem valor de mercado ficaram fora do total."),
    ).toBeInTheDocument();
  });

  it("says the lots could not be loaded", async () => {
    stubDashboard({ "GET /api/lots": () => problem(500, "Internal Server Error", "boom") });
    renderAt("/");

    const lots = await region("Lotes");
    expect(await within(lots).findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os lotes.",
    );
  });
});

describe("the best early sale check on the dashboard", () => {
  const lot: Lot = {
    id: 7,
    type: "ltn",
    maturity: "2029-01-01",
    purchase_date: "2023-01-02",
    rate: "0.11",
    unit_price: "650.00",
    quantity: "10.00",
  };
  const marketData = { bonds: FRESH_STATUS.bonds, focus: FRESH_STATUS.focus, indexes: [] };
  const checksOf = (checks: EarlySaleCheck[]) => () =>
    Response.json({ date: "2024-03-20", effect: "shorten_term", checks });

  it("shows the check the API ranks first, with its verdict and advantage", async () => {
    const requests = stubDashboard({
      "GET /api/early-sale-checks": checksOf([
        { lot, verdict: "sell", advantage: "-605.50", projected_by: [], market_data: marketData },
        {
          lot: { ...lot, id: 8, purchase_date: "2023-06-01" },
          verdict: "hold",
          advantage: "120.00",
          projected_by: [],
          market_data: marketData,
        },
      ]),
    });
    renderAt("/");

    const check = await region("Melhor venda antecipada");
    expect(await within(check).findByText("Vender agora")).toBeInTheDocument();
    expect(
      within(check).getByText("Tesouro Prefixado 2029 (compra em 02/01/2023)"),
    ).toBeInTheDocument();
    expect(within(check).getByText("Vantagem: -R$ 605,50, a favor de vender")).toBeInTheDocument();
    expect(within(check).queryByText("Manter até o vencimento")).not.toBeInTheDocument();
    expect(within(check).getByRole("link", { name: "Ver todos os lotes" })).toHaveAttribute(
      "href",
      "/venda-antecipada",
    );
    expect(
      requests
        .filter((r) => new URL(r.url).pathname === "/api/early-sale-checks")
        .map((r) => new URL(r.url).search),
    ).toEqual(["?effect=shorten_term"]);
  });

  it("says no lot can be checked when none has a verdict", async () => {
    stubDashboard({
      "GET /api/early-sale-checks": checksOf([
        { lot, unavailable: "matured", projected_by: [], market_data: marketData },
      ]),
    });
    renderAt("/");

    const check = await region("Melhor venda antecipada");
    expect(
      await within(check).findByText("Nenhum lote pode ser comparado hoje."),
    ).toBeInTheDocument();
  });

  it("links to recording a lot while none is", async () => {
    stubDashboard();
    renderAt("/");

    const check = await region("Melhor venda antecipada");
    expect(await within(check).findByRole("link", { name: "Registrar lote" })).toHaveAttribute(
      "href",
      "/lotes",
    );
  });

  it("says the checks could not be run", async () => {
    stubDashboard({
      "GET /api/early-sale-checks": () => problem(500, "Internal Server Error", "boom"),
    });
    renderAt("/");

    const check = await region("Melhor venda antecipada");
    expect(await within(check).findByRole("alert")).toHaveTextContent(
      "Não foi possível comparar os lotes.",
    );
  });

  it("asks for the mortgage while none is registered", async () => {
    stubDashboard({
      "GET /api/early-sale-checks": () => problem(404, "Not Found", "no mortgage is registered"),
    });
    renderAt("/");

    const check = await region("Melhor venda antecipada");
    expect(
      await within(check).findByText("Cadastre o financiamento para comparar os lotes."),
    ).toBeInTheDocument();
  });
});

describe("the best decision on the dashboard", () => {
  const marketData = { bonds: FRESH_STATUS.bonds, focus: FRESH_STATUS.focus, indexes: [] };
  const flow = (date: string, outstanding_balance: string): CashFlow => ({
    date,
    invested: "0.00",
    prepaid: "0.00",
    held: "0.00",
    outstanding_balance,
  });
  const scenario = (flows: CashFlow[]): Scenario => ({
    net_worth: "0.00",
    cash: "0.00",
    outstanding_balance: flows.at(-1)?.outstanding_balance ?? "0.00",
    cash_flows: flows,
  });
  const ltn: Verdict = {
    type: "ltn",
    maturity: "2029-01-01",
    rate: "0.1276",
    unit_price: "771.26",
    quantity: "12.96",
    advantage: "1234.56",
    avoided_cost: "456.78",
    break_even_rate: "0.1102",
    invest: scenario([flow("2024-03-20", "30000.00"), flow("2029-01-01", "0.00")]),
    prepay: scenario([flow("2024-03-20", "20000.00"), flow("2029-01-01", "0.00")]),
    projected_by: [],
    market_data: marketData,
  };
  const ntnf: Verdict = { ...ltn, type: "ntn_f", maturity: "2035-01-01", advantage: "-250.30" };
  const ntnfSmall: Verdict = {
    type: "ntn_f",
    maturity: "2031-01-01",
    rate: "0.13",
    unavailable: "amount_too_small",
    projected_by: [],
    market_data: marketData,
  };
  const decisionOf = (verdicts: Verdict[]) => () =>
    Response.json({ amount: "10000.00", date: "2024-03-20", effect: "shorten_term", verdicts });

  async function compare(amount: string) {
    const form = await screen.findByRole("form", { name: "Simular decisão" });
    fireEvent.change(within(form).getByLabelText("Valor"), { target: { value: amount } });
    fireEvent.click(within(form).getByRole("button", { name: "Comparar" }));
  }

  it("compares the amount and shows the verdict of the highest advantage with its scenarios' balances", async () => {
    const requests = stubDashboard({
      "POST /api/decisions": decisionOf([ntnf, ntnfSmall, ltn]),
    });
    renderAt("/");

    const best = await region("Melhor decisão");
    expect(within(best).queryByRole("img")).not.toBeInTheDocument();
    await compare("10.000,00");

    expect(await within(best).findByText("Tesouro Prefixado 2029")).toBeInTheDocument();
    expect(
      requests.filter((r) => r.method === "POST").map((r) => [new URL(r.url).pathname, r.body]),
    ).toEqual([["/api/decisions", { amount: "10000.00", effect: "shorten_term" }]]);
    expect(
      within(best).getByText("Vantagem: +R$ 1.234,56, a favor de investir"),
    ).toBeInTheDocument();
    expect(
      within(best).getByText(
        "Taxa de equilíbrio: 11,02%. A taxa de hoje, 12,76%, está acima dela.",
      ),
    ).toBeInTheDocument();
    expect(
      within(best).getByRole("img", { name: "Saldo devedor ao investir e ao amortizar" }),
    ).toBeInTheDocument();
    expect(within(best).getByRole("link", { name: "Ver todos os títulos" })).toHaveAttribute(
      "href",
      "/decisao",
    );
  });

  it("tells apart advantages a cent apart however large", async () => {
    stubDashboard({
      "POST /api/decisions": decisionOf([
        { ...ltn, advantage: "100000000000000.01" },
        { ...ntnf, advantage: "100000000000000.02" },
      ]),
    });
    renderAt("/");

    await compare("10000");

    const best = await region("Melhor decisão");
    expect(
      await within(best).findByText("Tesouro Prefixado com Juros Semestrais 2035"),
    ).toBeInTheDocument();
  });

  it("shows prepaying as the best decision when every advantage favours it", async () => {
    stubDashboard({
      "POST /api/decisions": decisionOf([{ ...ltn, advantage: "-900.00" }, ntnf]),
    });
    renderAt("/");

    await compare("10000");

    const best = await region("Melhor decisão");
    expect(
      await within(best).findByText("Tesouro Prefixado com Juros Semestrais 2035"),
    ).toBeInTheDocument();
    expect(
      within(best).getByText("Vantagem: -R$ 250,30, a favor de amortizar"),
    ).toBeInTheDocument();
  });

  it("says no bond could be compared when every verdict is unavailable", async () => {
    stubDashboard({ "POST /api/decisions": decisionOf([ntnfSmall]) });
    renderAt("/");

    await compare("10");

    const best = await region("Melhor decisão");
    expect(
      await within(best).findByText("Nenhum título pôde ser comparado com esse valor."),
    ).toBeInTheDocument();
  });

  it("says no bond on offer follows the mortgage's indexer", async () => {
    stubDashboard({ "POST /api/decisions": decisionOf([]) });
    renderAt("/");

    await compare("10000");

    const best = await region("Melhor decisão");
    expect(
      await within(best).findByText(
        "Nenhum título à venda acompanha o indexador do financiamento.",
      ),
    ).toBeInTheDocument();
  });

  it("shows what the API rejects next to the amount", async () => {
    stubDashboard({
      "POST /api/decisions": () =>
        problem(422, "Unprocessable Entity", "validation failed", [
          { location: "body.amount", message: "expected string to match pattern" },
        ]),
    });
    renderAt("/");

    await compare("abc");

    const form = await screen.findByRole("form", { name: "Simular decisão" });
    await waitFor(() => expect(within(form).getByLabelText("Valor")).toBeInvalid());
  });

  it("links to registering a mortgage while none is", async () => {
    stubDashboard({
      "POST /api/decisions": () => problem(404, "Not Found", "no mortgage is registered"),
    });
    renderAt("/");

    await compare("10000");

    const best = await region("Melhor decisão");
    expect(
      await within(best).findByRole("link", { name: "Cadastrar financiamento" }),
    ).toHaveAttribute("href", "/financiamento/editar");
  });
});

describe("the market data on the dashboard", () => {
  it("flags each kind of market data that is stale, failed or missing", async () => {
    stubDashboard({
      "GET /api/market-data/status": () =>
        Response.json({
          ...FRESH_STATUS,
          indexes: [
            { index: "tr", status: "failed", failed_at: "2024-03-20T09:00:00Z" },
            { index: "selic", status: "fresh", refreshed_at: "2024-03-19T18:23:42Z" },
          ],
          bonds: { status: "stale", refreshed_at: "2024-03-15T18:24:00Z" },
          focus: { status: "missing" },
        } satisfies MarketDataStatus),
    });
    renderAt("/");

    const marketData = await region("Dados de mercado");
    const alerts = await within(marketData).findAllByRole("alert");
    expect(
      alerts.map((alert) =>
        ["alert-title", "alert-description"].map(
          (slot) => alert.querySelector(`[data-slot="${slot}"]`)?.textContent,
        ),
      ),
    ).toEqual([
      [
        "Preços dos títulos",
        "Dados desatualizados: a última atualização foi há mais de dois dias.",
      ],
      ["Expectativas do Focus", "Ainda não há expectativas do Focus."],
      ["TR", "A última atualização falhou em 20/03/2024 09:00."],
    ]);
    expect(within(marketData).getByRole("link", { name: "Ver índices" })).toHaveAttribute(
      "href",
      "/indices",
    );
  });

  it("says the market data is fresh when nothing is wrong with it", async () => {
    stubDashboard();
    renderAt("/");

    const marketData = await region("Dados de mercado");
    expect(await within(marketData).findByText("Dados de mercado em dia.")).toBeInTheDocument();
    expect(within(marketData).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says the market data status could not be loaded", async () => {
    stubDashboard({
      "GET /api/market-data/status": () => problem(500, "Internal Server Error", "boom"),
    });
    renderAt("/");

    const marketData = await region("Dados de mercado");
    expect(await within(marketData).findByRole("alert")).toHaveTextContent(
      "Não foi possível verificar os dados de mercado.",
    );
  });
});
