import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BondCatalogue,
  BondQuote,
  IndexValue,
  MarketDataStatus,
  ProjectedValue,
  ProjectionMethodName,
  ProjectionMethods,
  RegisteredMortgage,
} from "@/lib/api";
import { ipcaMortgage, trMortgage } from "@/test/mortgageFixtures";
import { renderAt } from "@/test/renderAt";
import { problem, type RecordedRequest, stubRoutes } from "@/test/stubServer";

const FETCHED_AT = "2024-04-14T18:20:33Z";

const FRESH_STATUS: MarketDataStatus = {
  refreshing: false,
  indexes: [
    { index: "tr", status: "fresh", refreshed_at: "2024-04-14T18:23:39Z" },
    { index: "poupanca_yield", status: "fresh", refreshed_at: "2024-04-14T18:23:40Z" },
    { index: "selic_target", status: "fresh", refreshed_at: "2024-04-14T18:23:41Z" },
    { index: "selic", status: "fresh", refreshed_at: "2024-04-14T18:23:42Z" },
    { index: "ipca", status: "fresh", refreshed_at: "2024-04-14T18:23:43Z" },
    { index: "ipca_number", status: "fresh", refreshed_at: "2024-04-15T09:00:00Z" },
  ],
  bonds: { status: "fresh", refreshed_at: "2024-04-14T18:24:00Z" },
  focus: { status: "fresh", refreshed_at: "2024-04-14T18:24:30Z" },
};

function value(periodStart: string, periodEnd: string, v: string): IndexValue {
  return { period_start: periodStart, period_end: periodEnd, value: v, fetched_at: FETCHED_AT };
}

const HISTORIES: Record<string, IndexValue[]> = {
  tr: [value("2024-03-01", "2024-04-01", "0.0331"), value("2024-03-02", "2024-04-02", "0.0299")],
  poupanca_yield: [
    value("2024-02-01", "2024-03-01", "0.5000"),
    value("2024-03-01", "2024-04-01", "0.6115"),
  ],
  selic_target: [
    value("2024-01-31", "2024-01-31", "11.75"),
    value("2024-03-20", "2024-03-20", "10.75"),
  ],
  selic: [
    value("2024-03-19", "2024-03-19", "0.041957"),
    value("2024-03-20", "2024-03-20", "0.040168"),
  ],
  ipca: [value("2024-01-01", "2024-01-01", "0.42"), value("2024-02-01", "2024-02-01", "-0.32")],
  ipca_number: [
    value("2024-01-01", "2024-01-01", "6873.5500000000000"),
    // SIDRA pads index numbers to 13 places.
    value("2024-02-01", "2024-02-01", "6927.8500000000000"),
  ],
};

const TR_12 = { index: "tr", method: "trailing_12" } as const;
const SELIC_FOCUS = { index: "selic_target", method: "focus" } as const;
const IPCA_FOCUS = { index: "ipca", method: "focus" } as const;

function projected(
  periodStart: string,
  v: string,
  ...methods: ProjectedValue["methods"]
): ProjectedValue {
  return { period_start: periodStart, period_end: periodStart, value: v, methods };
}

const PROJECTIONS: Record<string, ProjectedValue[]> = {
  tr: [projected("2024-04-01", "0.0150", TR_12)],
  poupanca_yield: [projected("2024-04-01", "0.6000", TR_12, SELIC_FOCUS)],
  selic_target: [projected("2024-05-09", "10.50", SELIC_FOCUS)],
  ipca: [projected("2024-03-01", "0.40", IPCA_FOCUS)],
};

const ALL_METHODS: ProjectionMethodName[] = ["focus", "trailing_12", "trailing_60"];

const METHODS: ProjectionMethods = {
  methods: [
    { index: "tr", method: "trailing_12", offered: ["trailing_12", "trailing_60"] },
    { index: "selic_target", method: "focus", offered: ALL_METHODS },
    { index: "ipca", method: "focus", offered: ALL_METHODS },
  ],
};

function quote(type: BondQuote["type"], maturity: string, rate: string, price: string): BondQuote {
  return {
    type,
    maturity,
    fetched_at: FETCHED_AT,
    buy: { rate, unit_price: price },
    sell: { rate: "0.1300", unit_price: "1234.56" },
  };
}

const CATALOGUE: BondCatalogue = {
  bonds: [
    quote("ltn", "2029-01-01", "0.1215", "789.40"),
    { ...quote("ntn_f", "2031-01-01", "0.1180", "621.05"), buy: undefined },
    quote("ntn_b_principal", "2035-05-15", "0.0684", "2311.77"),
    quote("ntn_b", "2033-05-15", "0.0690", "4402.16"),
  ],
};

type Routes = Parameters<typeof stubRoutes>[0];

interface Backend {
  mortgage: RegisteredMortgage;
  status: MarketDataStatus;
  histories: Record<string, IndexValue[]>;
  methods: ProjectionMethods;
  catalogue: BondCatalogue;
}

const origin = window.location.origin;
const get = (path: string) => ({ method: "GET", url: new URL(path, origin).href });

// `routes` replaces or adds handlers; a replacement must use the key it replaces, as the first
// matching route answers.
function stubBackend(partial: Partial<Backend> = {}, routes: Routes = {}): RecordedRequest[] {
  const backend: Backend = {
    mortgage: trMortgage,
    status: FRESH_STATUS,
    histories: HISTORIES,
    methods: METHODS,
    catalogue: CATALOGUE,
    ...partial,
  };
  return stubRoutes({
    ...routes,
    "GET /api/mortgage": () => Response.json(backend.mortgage),
    "GET /api/market-data/status": () => Response.json(backend.status),
    "GET /api/indexes/projection-methods": () => Response.json(backend.methods),
    "GET /api/indexes/:index/history": (_req, { index }) =>
      Response.json({ index, values: backend.histories[index] }),
    "GET /api/indexes/:index/projection": (_req, { index }) =>
      Response.json({ index, values: PROJECTIONS[index] ?? [] }),
    "GET /api/bonds": () => Response.json(backend.catalogue),
    // Again, so a replacement wins over the default under the same key.
    ...routes,
  });
}

function withIndexStatus(override: MarketDataStatus["indexes"][number]): MarketDataStatus {
  return {
    ...FRESH_STATUS,
    indexes: FRESH_STATUS.indexes.map((s) => (s.index === override.index ? override : s)),
  };
}

const PROBLEM = () => problem(503, "Service Unavailable", "database is unavailable");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2024-04-15T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const indexList = () => screen.findByRole("list", { name: "Índices" });

describe("Índices", () => {
  it("is where Mercado opens, under its title", async () => {
    stubBackend();

    renderAt("/");
    fireEvent.click(await screen.findByRole("link", { name: "Mercado" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Mercado" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Índices" })).toHaveAttribute("aria-checked", "true");
    expect(await indexList()).toBeInTheDocument();
  });

  it("lists every index with its latest value and the date of it", async () => {
    stubBackend();

    renderAt("/mercado");

    const rows = within(await indexList()).getAllByRole("link");
    expect(rows.map((row) => row.textContent)).toEqual([
      "TRSeu financiamentoCorrige o saldo do seu financiamento0,0299% ao mês02/03/2024 a 02/04/2024",
      "Remuneração da poupançaUsada em parte dos contratos com TR0,6115% ao mês01/03/2024 a 01/04/2024",
      "Selic metaTaxa básica de juros10,75% ao ano20/03/2024",
      "Selic diáriaTaxa média dos títulos públicos0,040168% ao dia20/03/2024",
      "IPCAInflação oficial-0,32% no mêsfev/2024",
      "IPCA (número-índice)Base do valor dos títulos IPCA+6.927,85fev/2024",
    ]);
  });

  it("marks the index the mortgage is corrected by", async () => {
    stubBackend({ mortgage: ipcaMortgage });

    renderAt("/mercado");

    const list = within(await indexList());
    expect(
      list.getByRole("link", { name: "IPCA, seu financiamento, -0,32% no mês, fev/2024" }),
    ).toBeInTheDocument();
    expect(list.getAllByText("Seu financiamento")).toHaveLength(1);
  });

  it("says when the data was last updated and names what is stale, with no way to refresh", async () => {
    stubBackend({
      status: {
        ...withIndexStatus({
          index: "selic",
          status: "stale",
          refreshed_at: "2024-04-10T09:05:00Z",
        }),
        focus: { status: "missing" },
      },
    });

    renderAt("/mercado");

    expect(
      await screen.findByText("Dados do Banco Central e do IBGE. Atualizados em 15/04/2024."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Expectativas do Focus indisponível. Selic diária de 10/04."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Atualizar/ })).not.toBeInTheDocument();
  });

  it("shows no stale note while every source is fresh", async () => {
    stubBackend();

    renderAt("/mercado");

    await indexList();
    expect(screen.queryByText(/indisponível|de \d\d\/\d\d\./)).not.toBeInTheDocument();
  });

  it("lists an index with no values yet", async () => {
    stubBackend({
      status: withIndexStatus({ index: "ipca", status: "missing" }),
      histories: { ...HISTORIES, ipca: [] },
    });

    renderAt("/mercado");

    expect(
      within(await indexList()).getByRole("link", { name: "IPCA, sem dados" }),
    ).toBeInTheDocument();
  });

  it("keeps the other indexes listed when one fails to load", async () => {
    stubBackend(
      {},
      {
        "GET /api/indexes/tr/history": PROBLEM,
        "GET /api/indexes/ipca/projection": PROBLEM,
      },
    );

    renderAt("/mercado");

    const list = within(await indexList());
    expect(
      list.getByRole("link", { name: "TR, seu financiamento, não foi possível carregar" }),
    ).toBeInTheDocument();
    expect(list.getByRole("link", { name: "IPCA, -0,32% no mês, fev/2024" })).toBeInTheDocument();
  });

  it("offers to try again when the indexes fail to load, and loads them on the retry", async () => {
    let fail = true;
    stubBackend(
      {},
      {
        "GET /api/market-data/status": () => (fail ? PROBLEM() : Response.json(FRESH_STATUS)),
      },
    );

    renderAt("/mercado");

    const panel = await screen.findByRole("alert");
    expect(panel).toHaveTextContent("Não foi possível carregar os índices");
    fail = false;
    fireEvent.click(within(panel).getByRole("button", { name: "Tentar novamente" }));

    expect(await indexList()).toBeInTheDocument();
  });
});

describe("an index's page", () => {
  it("opens from its row with its latest value and its chart", async () => {
    stubBackend();

    renderAt("/mercado");
    fireEvent.click(within(await indexList()).getByRole("link", { name: /^IPCA,/ }));

    expect(await screen.findByRole("heading", { level: 1, name: "IPCA" })).toBeInTheDocument();
    const latest = within(await screen.findByRole("region", { name: "Último valor" }));
    expect(latest.getByText("-0,32% no mês")).toBeInTheDocument();
    expect(latest.getByText("em fevereiro de 2024")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Histórico e projeção de IPCA" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "5 anos" })).toHaveAttribute("aria-checked", "true");
    expect(
      within(screen.getByRole("navigation", { name: "Principal" })).getByRole("link", {
        name: "Mercado",
      }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("switches the period the chart shows", async () => {
    stubBackend();

    renderAt("/mercado/indices/ipca");
    fireEvent.click(await screen.findByRole("radio", { name: "1 ano" }));

    expect(screen.getByRole("radio", { name: "1 ano" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("img", { name: "Histórico e projeção de IPCA" })).toBeInTheDocument();
  });

  it("charts the history alone while the projection has no values", async () => {
    stubBackend(
      {},
      { "GET /api/indexes/tr/projection": () => Response.json({ index: "tr", values: [] }) },
    );

    renderAt("/mercado/indices/tr");

    expect(await screen.findByRole("img", { name: "Histórico de TR" })).toBeInTheDocument();
  });

  it("goes back to Mercado", async () => {
    stubBackend();

    renderAt("/mercado/indices/ipca");
    fireEvent.click(within(await screen.findByRole("main")).getByRole("link", { name: "Mercado" }));

    expect(await indexList()).toBeInTheDocument();
  });

  it("charts the history alone for an index that is not projected", async () => {
    stubBackend();

    renderAt("/mercado/indices/selic");

    expect(
      await screen.findByRole("img", { name: "Histórico de Selic diária" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Projeção" })).not.toBeInTheDocument();
  });

  it("names the stale data it shows", async () => {
    stubBackend({
      status: {
        ...withIndexStatus({
          index: "ipca",
          status: "failed",
          refreshed_at: "2024-04-01T10:00:00Z",
        }),
        focus: { status: "stale", refreshed_at: "2024-04-02T10:00:00Z" },
      },
    });

    renderAt("/mercado/indices/ipca");

    expect(
      await screen.findByText("Expectativas do Focus de 02/04. IPCA de 01/04."),
    ).toBeInTheDocument();
  });

  it("leaves the Focus out of the note for an index not projected by it", async () => {
    stubBackend({
      status: { ...FRESH_STATUS, focus: { status: "stale", refreshed_at: "2024-04-02T10:00:00Z" } },
    });

    renderAt("/mercado/indices/tr");

    await screen.findByRole("radiogroup", { name: "Projeção" });
    expect(screen.queryByText(/Expectativas do Focus/)).not.toBeInTheDocument();
  });

  it("says when there are no values yet and draws no chart", async () => {
    stubBackend({ histories: { ...HISTORIES, ipca: [] } });

    renderAt("/mercado/indices/ipca");

    expect(await screen.findByText("Ainda não há valores deste índice.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it.each([
    ["history", "GET /api/indexes/ipca/history"],
    ["projection", "GET /api/indexes/ipca/projection"],
    ["projection methods", "GET /api/indexes/projection-methods"],
  ])("offers to try again when its %s fails to load", async (_, route) => {
    stubBackend({}, { [route]: PROBLEM });

    renderAt("/mercado/indices/ipca");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar o índice",
    );
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("is not found for an index the API does not serve", async () => {
    stubBackend();

    renderAt("/mercado/indices/cdi");

    expect(await screen.findByText("Esta página não existe")).toBeInTheDocument();
  });
});

describe("projection method", () => {
  const choices = () => screen.findByRole("radiogroup", { name: "Projeção" });

  it("offers the index's methods with the current one chosen", async () => {
    stubBackend();

    renderAt("/mercado/indices/tr");

    const group = within(await choices());
    expect(group.getAllByRole("radio").map((radio) => radio.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
    ]);
    expect(group.getByRole("radio", { name: "Média dos últimos 12 meses" })).toBeChecked();
    expect(group.getByRole("radio", { name: "Média dos últimos 60 meses" })).toBeInTheDocument();
  });

  it("saves the chosen method and reloads the projection shown", async () => {
    const requests = stubBackend(
      {},
      {
        "PUT /api/indexes/tr/projection-method": () =>
          Response.json({
            index: "tr",
            method: "trailing_60",
            offered: ["trailing_12", "trailing_60"],
          }),
      },
    );

    renderAt("/mercado/indices/tr");
    const group = within(await choices());
    const loaded = requests.length;
    fireEvent.click(group.getByRole("radio", { name: "Média dos últimos 60 meses" }));

    await waitFor(() =>
      expect(group.getByRole("radio", { name: "Média dos últimos 60 meses" })).toBeChecked(),
    );
    await waitFor(() => expect(group.getByRole("radio", { name: /60 meses/ })).toBeEnabled());
    expect(requests.slice(loaded)).toEqual([
      {
        method: "PUT",
        url: new URL("/api/indexes/tr/projection-method", origin).href,
        body: { method: "trailing_60" },
      },
      get("/api/indexes/tr/projection"),
    ]);
  });

  it("says the method could not be saved and keeps the saved one", async () => {
    stubBackend(
      {},
      {
        "PUT /api/indexes/tr/projection-method": () =>
          problem(422, "Unprocessable Entity", "trailing_60 is not offered"),
      },
    );

    renderAt("/mercado/indices/tr");
    const group = within(await choices());
    fireEvent.click(group.getByRole("radio", { name: "Média dos últimos 60 meses" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível salvar o método de projeção.",
    );
    expect(group.getByRole("radio", { name: "Média dos últimos 12 meses" })).toBeChecked();
  });

  it("says what the poupança yield's projection derives from", async () => {
    stubBackend();

    renderAt("/mercado/indices/poupanca_yield");

    const section = within(await screen.findByRole("region", { name: "Projeção" }));
    const derivation = section.getByText(
      (_, element) =>
        element?.tagName === "P" && element.textContent?.startsWith("A projeção deriva") === true,
    );
    expect(derivation.textContent).toBe(
      "A projeção deriva da TR projetada pela média dos últimos 12 meses e da Selic meta projetada pela mediana do Focus (BCB), segundo a regra da poupança.",
    );
    expect(section.getByRole("link", { name: "Selic meta" })).toHaveAttribute(
      "href",
      "/mercado/indices/selic_target",
    );
    expect(section.queryByRole("radio")).not.toBeInTheDocument();
  });
});

describe("Títulos", () => {
  const tableRows = (name: string) =>
    within(screen.getByRole("table", { name }))
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.textContent?.replace(/\s/g, " "));

  it("lists first the bonds comparable with a TR mortgage, with their quotes", async () => {
    stubBackend();

    renderAt("/mercado");
    fireEvent.click(await screen.findByRole("radio", { name: "Títulos" }));

    await screen.findByRole("table", { name: "Comparáveis com seu financiamento" });
    expect(tableRows("Comparáveis com seu financiamento")).toEqual([
      "Tesouro Prefixado 202901/01/202912,15%R$ 789,4013,00%R$ 1.234,56",
      "Tesouro Prefixado com Juros Semestrais 203101/01/2031Fora de oferta13,00%R$ 1.234,56",
    ]);
    expect(screen.getByText("Taxas e preços do Tesouro Direto em 14/04/2024.")).toBeInTheDocument();
  });

  it("keeps the other bonds in a collapsed group", async () => {
    stubBackend();

    renderAt("/mercado/titulos");

    const toggle = await screen.findByRole("button", {
      name: "Tesouro IPCA+ e outros · 2 títulos",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("table", { name: "Outros títulos" })).not.toBeInTheDocument();
    fireEvent.click(toggle);

    expect(tableRows("Outros títulos")).toEqual([
      "Tesouro IPCA+ 203515/05/2035IPCA + 6,84%R$ 2.311,77IPCA + 13,00%R$ 1.234,56",
      "Tesouro IPCA+ com Juros Semestrais 203315/05/2033IPCA + 6,90%R$ 4.402,16IPCA + 13,00%R$ 1.234,56",
    ]);
  });

  it("puts the IPCA+ bonds first for an IPCA mortgage", async () => {
    stubBackend({ mortgage: ipcaMortgage });

    renderAt("/mercado/titulos");

    await screen.findByRole("table", { name: "Comparáveis com seu financiamento" });
    expect(tableRows("Comparáveis com seu financiamento").map((r) => r?.slice(0, 13))).toEqual([
      "Tesouro IPCA+",
      "Tesouro IPCA+",
    ]);
    expect(
      screen.getByRole("button", { name: "Tesouro Prefixado e outros · 2 títulos" }),
    ).toBeInTheDocument();
  });

  it("names stale prices", async () => {
    stubBackend({
      status: { ...FRESH_STATUS, bonds: { status: "stale", refreshed_at: "2024-04-10T09:05:00Z" } },
    });

    renderAt("/mercado/titulos");

    expect(await screen.findByText("Preços dos títulos de 10/04.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Atualizar/ })).not.toBeInTheDocument();
  });

  it("says when there are no bonds", async () => {
    stubBackend({ catalogue: { bonds: [] } });

    renderAt("/mercado/titulos");

    expect(await screen.findByText("Nenhum título disponível.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("offers to try again when the bonds fail to load", async () => {
    let fail = true;
    const requests = stubBackend(
      {},
      { "GET /api/bonds": () => (fail ? PROBLEM() : Response.json(CATALOGUE)) },
    );

    renderAt("/mercado/titulos");

    const panel = await screen.findByRole("alert");
    expect(panel).toHaveTextContent("Não foi possível carregar os títulos");
    fail = false;
    fireEvent.click(within(panel).getByRole("button", { name: "Tentar novamente" }));

    expect(
      await screen.findByRole("table", { name: "Comparáveis com seu financiamento" }),
    ).toBeInTheDocument();
    expect(requests.filter((r) => r.url.endsWith("/api/bonds"))).toHaveLength(2);
  });
});
