import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BondCatalogue, MarketDataStatus } from "@/lib/api";
import { renderAt } from "@/test/renderAt";
import { type RecordedRequest, stubRoutes } from "@/test/stubServer";

const FETCHED_AT = "2026-10-23T21:00:00Z";

const FRESH_STATUS: MarketDataStatus = {
  refreshing: false,
  indexes: [
    { index: "tr", status: "fresh", refreshed_at: "2026-10-25T18:23:39Z" },
    { index: "poupanca_yield", status: "fresh", refreshed_at: "2026-10-25T18:23:40Z" },
    { index: "selic_target", status: "fresh", refreshed_at: "2026-10-25T18:23:41Z" },
    { index: "selic", status: "fresh", refreshed_at: "2026-10-25T18:23:42Z" },
    { index: "ipca", status: "fresh", refreshed_at: "2026-10-25T18:23:43Z" },
  ],
  bonds: { status: "fresh", refreshed_at: "2026-10-25T18:24:00Z" },
};

// LTN, NTN-F, NTN-B Principal, then NTN-B, each by maturity; the 2027 LTN is not on offer, so it
// has no buy. IPCA+ rates are real rates over IPCA.
const CATALOGUE: BondCatalogue = {
  bonds: [
    {
      type: "ltn",
      maturity: "2027-07-01",
      sell: { rate: "0.1391", unit_price: "828.07" },
      fetched_at: FETCHED_AT,
    },
    {
      type: "ltn",
      maturity: "2029-01-01",
      buy: { rate: "0.1276", unit_price: "771.26" },
      sell: { rate: "0.1288", unit_price: "769.49" },
      fetched_at: FETCHED_AT,
    },
    {
      type: "ntn_f",
      maturity: "2037-01-01",
      buy: { rate: "0.1312", unit_price: "812.5" },
      sell: { rate: "0.1324", unit_price: "1000.05" },
      fetched_at: FETCHED_AT,
    },
    {
      type: "ntn_b_principal",
      maturity: "2032-08-15",
      buy: { rate: "0.0672", unit_price: "3278.12" },
      sell: { rate: "0.0684", unit_price: "3256.93" },
      fetched_at: FETCHED_AT,
    },
    {
      type: "ntn_b",
      maturity: "2037-05-15",
      buy: { rate: "0.0670", unit_price: "4669.3" },
      sell: { rate: "0.0682", unit_price: "4629.32" },
      fetched_at: FETCHED_AT,
    },
  ],
};

interface Backend {
  status: MarketDataStatus;
  catalogue: BondCatalogue;
}

function stubBackend(backend: Backend): RecordedRequest[] {
  return stubRoutes({
    "GET /api/health": () => Response.json({ status: "ok" }),
    "GET /api/market-data/status": () => Response.json(backend.status),
    "GET /api/bonds": () => Response.json(backend.catalogue),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// The text of every row of the table, cell by cell, whitespace normalized (Intl writes a no-break
// space after "R$").
function tableText(): string[][] {
  return within(screen.getByRole("table"))
    .getAllByRole("row")
    .map((row) =>
      Array.from((row as HTMLTableRowElement).cells, (cell) =>
        (cell.textContent ?? "").replace(/\s+/g, " ").trim(),
      ),
    );
}

describe("bonds page", () => {
  it("is reached from the nav in the header", async () => {
    stubBackend({ status: FRESH_STATUS, catalogue: CATALOGUE });

    renderAt("/");
    fireEvent.click(await screen.findByRole("link", { name: "Títulos" }));

    expect(await screen.findByRole("heading", { name: "Títulos" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Índices" })).toHaveAttribute("href", "/indices");
  });

  it("lists every bond with its maturity, rates and prices, and — where it is not on offer", async () => {
    stubBackend({ status: FRESH_STATUS, catalogue: CATALOGUE });

    renderAt("/titulos");

    await screen.findByText("Tesouro Prefixado 2029");
    expect(tableText()).toEqual([
      [
        "Título",
        "Vencimento",
        "Taxa de compra",
        "Preço de compra",
        "Taxa de venda",
        "Preço de venda",
      ],
      ["Tesouro Prefixado 2027", "01/07/2027", "—", "—", "13,91%", "R$ 828,07"],
      ["Tesouro Prefixado 2029", "01/01/2029", "12,76%", "R$ 771,26", "12,88%", "R$ 769,49"],
      [
        "Tesouro Prefixado com Juros Semestrais 2037",
        "01/01/2037",
        "13,12%",
        "R$ 812,50",
        "13,24%",
        "R$ 1.000,05",
      ],
      [
        "Tesouro IPCA+ 2032",
        "15/08/2032",
        "IPCA + 6,72%",
        "R$ 3.278,12",
        "IPCA + 6,84%",
        "R$ 3.256,93",
      ],
      [
        "Tesouro IPCA+ com Juros Semestrais 2037",
        "15/05/2037",
        "IPCA + 6,70%",
        "R$ 4.669,30",
        "IPCA + 6,82%",
        "R$ 4.629,32",
      ],
    ]);
  });
});

describe("refresh time", () => {
  it("shows when the bond prices were last refreshed", async () => {
    stubBackend({ status: FRESH_STATUS, catalogue: CATALOGUE });

    renderAt("/titulos");

    expect(await screen.findByText("Atualizado em 25/10/2026 18:24")).toBeInTheDocument();
  });

  it("says the prices were never refreshed", async () => {
    stubBackend({
      status: { ...FRESH_STATUS, bonds: { status: "missing" } },
      catalogue: { bonds: [] },
    });

    renderAt("/titulos");

    expect(await screen.findByText("Nunca atualizado")).toBeInTheDocument();
  });
});

describe("warnings", () => {
  function withBonds(bonds: MarketDataStatus["bonds"], catalogue = CATALOGUE): Backend {
    return { status: { ...FRESH_STATUS, bonds }, catalogue };
  }

  it("shows no warning while the bond prices are fresh", async () => {
    stubBackend({ status: FRESH_STATUS, catalogue: CATALOGUE });

    renderAt("/titulos");

    expect(await screen.findByText("Tesouro Prefixado 2029")).toBeInTheDocument();
    expect(await screen.findByText("Atualizado em 25/10/2026 18:24")).toBeInTheDocument();
    expect(screen.queryAllByRole("alert")).toEqual([]);
  });

  it("warns that stale prices are more than two days old", async () => {
    stubBackend(withBonds({ status: "stale", refreshed_at: "2026-10-23T09:05:00Z" }));

    renderAt("/titulos");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dados desatualizados: a última atualização foi há mais de dois dias.",
    );
    expect(screen.getByText("Atualizado em 23/10/2026 09:05")).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("warns when the latest refresh failed and still shows the last prices", async () => {
    stubBackend(
      withBonds({
        status: "failed",
        refreshed_at: "2026-10-24T18:23:41Z",
        failed_at: "2026-10-25T17:00:07Z",
      }),
    );

    renderAt("/titulos");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A última atualização falhou em 25/10/2026 17:00.",
    );
    expect(screen.getByText("Atualizado em 24/10/2026 18:23")).toBeInTheDocument();
    expect(screen.getByText("Tesouro Prefixado 2029")).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("warns that there are no bond prices yet", async () => {
    stubBackend(withBonds({ status: "missing" }, { bonds: [] }));

    renderAt("/titulos");

    expect(await screen.findByRole("alert")).toHaveTextContent("Ainda não há preços de títulos.");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});

describe("refresh", () => {
  const origin = window.location.origin;
  const get = (path: string) => ({ method: "GET", url: new URL(path, origin).href });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts a refresh, shows it running, and loads the new prices when it ends", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const statuses = [
      { ...FRESH_STATUS, refreshing: true },
      {
        ...FRESH_STATUS,
        bonds: { status: "fresh" as const, refreshed_at: "2026-10-25T18:30:00Z" },
      },
    ];
    let refreshed = false;
    const requests = stubRoutes({
      "GET /api/market-data/status": () => {
        if (!refreshed) return Response.json(FRESH_STATUS);
        // The first poll still finds the refresh running; the second finds it done.
        return Response.json(statuses.shift() ?? FRESH_STATUS);
      },
      "POST /api/market-data/refresh": () => {
        refreshed = true;
        return Response.json({ ...FRESH_STATUS, refreshing: true }, { status: 202 });
      },
      "GET /api/bonds": () =>
        Response.json(
          statuses.length === 0
            ? { bonds: [{ ...CATALOGUE.bonds[1], sell: { rate: "0.1290", unit_price: "768.00" } }] }
            : CATALOGUE,
        ),
    });

    renderAt("/titulos");
    expect(await screen.findByText("Tesouro Prefixado 2029")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));

    expect(await screen.findByRole("button", { name: "Atualizando…" })).toBeDisabled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(screen.getByRole("button", { name: "Atualizando…" })).toBeDisabled();
    await vi.advanceTimersByTimeAsync(2000);

    expect(await screen.findByText("R$ 768,00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atualizar" })).toBeEnabled();
    expect(screen.getByText("Atualizado em 25/10/2026 18:30")).toBeInTheDocument();
    const expectedRequests = [
      get("/api/market-data/status"),
      get("/api/bonds"),
      { method: "POST", url: new URL("/api/market-data/refresh", origin).href },
      get("/api/market-data/status"),
      get("/api/market-data/status"),
      get("/api/bonds"),
    ];
    expect(requests).toEqual(expectedRequests);
  });

  it("says when the refresh could not be started", async () => {
    stubRoutes({
      "GET /api/market-data/status": () => Response.json(FRESH_STATUS),
      "GET /api/bonds": () => Response.json(CATALOGUE),
      "POST /api/market-data/refresh": () =>
        Response.json(
          { title: "Internal Server Error", status: 500, detail: "boom" },
          { status: 500 },
        ),
    });

    renderAt("/titulos");
    fireEvent.click(await screen.findByRole("button", { name: "Atualizar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível iniciar a atualização.",
    );
    expect(screen.getByRole("button", { name: "Atualizar" })).toBeEnabled();
  });
});

describe("empty and failed loads", () => {
  const PROBLEM = { title: "Service Unavailable", status: 503, detail: "database is unavailable" };

  it("says when no bond is available", async () => {
    stubBackend({ status: FRESH_STATUS, catalogue: { bonds: [] } });

    renderAt("/titulos");

    expect(await screen.findByText("Nenhum título disponível.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("says the bonds could not be loaded", async () => {
    stubRoutes({
      "GET /api/market-data/status": () => Response.json(FRESH_STATUS),
      "GET /api/bonds": () => Response.json(PROBLEM, { status: 503 }),
    });

    renderAt("/titulos");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os títulos.",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Nenhum título disponível.")).not.toBeInTheDocument();
  });
});
