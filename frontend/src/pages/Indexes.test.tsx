import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  IndexValue,
  MarketDataStatus,
  ProjectedValue,
  ProjectionMethodName,
  ProjectionMethods,
} from "@/lib/api";
import { renderAt } from "@/test/renderAt";
import { problem, type RecordedRequest, stubRoutes } from "@/test/stubServer";

const FETCHED_AT = "2026-10-25T18:20:33Z";

const FRESH_STATUS: MarketDataStatus = {
  refreshing: false,
  indexes: [
    { index: "tr", status: "fresh", refreshed_at: "2026-10-25T18:23:39Z" },
    { index: "poupanca_yield", status: "fresh", refreshed_at: "2026-10-25T18:23:40Z" },
    { index: "selic_target", status: "fresh", refreshed_at: "2026-10-25T18:23:41Z" },
    { index: "selic", status: "fresh", refreshed_at: "2026-10-25T18:23:42Z" },
    { index: "ipca", status: "fresh", refreshed_at: "2026-10-25T18:23:43Z" },
    { index: "ipca_number", status: "fresh", refreshed_at: "2026-10-25T18:23:44Z" },
  ],
  bonds: { status: "fresh", refreshed_at: "2026-10-25T18:24:00Z" },
  focus: { status: "fresh", refreshed_at: "2026-10-25T18:24:30Z" },
};

function value(periodStart: string, periodEnd: string, v: string): IndexValue {
  return { period_start: periodStart, period_end: periodEnd, value: v, fetched_at: FETCHED_AT };
}

// TR repeats a period start with several period ends, one per day of the month it was fixed.
const TR_VALUES = [
  value("2024-02-01", "2024-03-01", "0.0000"),
  value("2024-03-01", "2024-04-01", "0.0331"),
  value("2024-03-01", "2024-03-02", "0.0312"),
  value("2024-03-01", "2024-03-03", "0.0299"),
];

const HISTORIES: Record<string, IndexValue[]> = {
  tr: TR_VALUES,
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
const TR_60 = { index: "tr", method: "trailing_60" } as const;
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
  tr: [projected("2024-04-01", "0.0150", TR_12), projected("2024-05-01", "0.0150", TR_12)],
  poupanca_yield: [
    projected("2024-04-01", "0.6000", TR_12, SELIC_FOCUS),
    projected("2024-05-01", "0.6000", TR_12, SELIC_FOCUS),
  ],
  selic_target: [
    projected("2024-04-01", "10.50", SELIC_FOCUS),
    projected("2024-05-01", "10.25", SELIC_FOCUS),
  ],
  ipca: [projected("2024-03-01", "0.40", IPCA_FOCUS), projected("2024-04-01", "0.35", IPCA_FOCUS)],
};

const TR_60_PROJECTION = [
  projected("2024-04-01", "0.0020", TR_60),
  projected("2024-05-01", "0.0020", TR_60),
];

const ALL_METHODS: ProjectionMethodName[] = ["focus", "trailing_12", "trailing_60"];

const METHODS: ProjectionMethods = {
  methods: [
    { index: "tr", method: "trailing_12", offered: ["trailing_12", "trailing_60"] },
    { index: "selic_target", method: "focus", offered: ALL_METHODS },
    { index: "ipca", method: "focus", offered: ALL_METHODS },
  ],
};

type Routes = Parameters<typeof stubRoutes>[0];

interface Backend {
  status: MarketDataStatus;
  histories: Record<string, IndexValue[]>;
  methods: ProjectionMethods;
  projections: Record<string, ProjectedValue[]>;
}

const origin = window.location.origin;
const get = (path: string) => ({ method: "GET", url: new URL(path, origin).href });

function projectionRoutes(
  backend: Pick<Backend, "methods" | "projections"> = {
    methods: METHODS,
    projections: PROJECTIONS,
  },
): Routes {
  return {
    "GET /api/indexes/projection-methods": () => Response.json(backend.methods),
    "GET /api/indexes/:index/projection": (_req, { index }) =>
      Response.json({ index, values: backend.projections[index] ?? [] }),
  };
}

// `routes` replaces or adds handlers; a replacement must use the key it replaces, as the first
// matching route answers.
function stubBackend(partial: Partial<Backend>, routes: Routes = {}): RecordedRequest[] {
  const backend: Backend = {
    status: FRESH_STATUS,
    histories: HISTORIES,
    methods: METHODS,
    projections: PROJECTIONS,
    ...partial,
  };
  return stubRoutes({
    "GET /api/health": () => Response.json({ status: "ok" }),
    "GET /api/market-data/status": () => Response.json(backend.status),
    ...Object.fromEntries(
      Object.keys(HISTORIES).map((index) => [
        `GET /api/indexes/${index}/history`,
        () => Response.json({ index, values: backend.histories[index] }),
      ]),
    ),
    ...projectionRoutes(backend),
    ...routes,
  });
}

const INITIAL_REQUESTS = [
  get("/api/market-data/status"),
  get("/api/indexes/projection-methods"),
  get("/api/indexes/tr/history"),
  get("/api/indexes/tr/projection"),
  get("/api/indexes/poupanca_yield/history"),
  get("/api/indexes/poupanca_yield/projection"),
  get("/api/indexes/selic_target/history"),
  get("/api/indexes/selic_target/projection"),
  get("/api/indexes/selic/history"),
  get("/api/indexes/ipca/history"),
  get("/api/indexes/ipca/projection"),
  get("/api/indexes/ipca_number/history"),
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("indexes page", () => {
  it("is reached from the nav in the header", async () => {
    stubBackend({ status: FRESH_STATUS, histories: HISTORIES });

    renderAt("/");
    fireEvent.click(await screen.findByRole("link", { name: "Índices" }));

    expect(await screen.findByRole("heading", { name: "Índices" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Início" })).toHaveAttribute("href", "/");
  });

  it("shows one card per index, in order, with its unit", async () => {
    stubBackend({ status: FRESH_STATUS, histories: HISTORIES });

    renderAt("/indices");

    const cards = await screen.findAllByRole("region");
    expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual([
      "TR",
      "Remuneração da poupança",
      "Selic meta",
      "Selic diária",
      "IPCA",
      "IPCA (número-índice)",
    ]);
    expect(within(cards[0]).getByText("% no período")).toBeInTheDocument();
    expect(within(cards[1]).getByText("% no período")).toBeInTheDocument();
    expect(within(cards[2]).getByText("% a.a.")).toBeInTheDocument();
    expect(within(cards[3]).getByText("% a.d.")).toBeInTheDocument();
    expect(within(cards[4]).getByText("% no mês")).toBeInTheDocument();
    expect(within(cards[5]).getByText("dez/1993 = 100")).toBeInTheDocument();
  });
});

describe("latest value and refresh time", () => {
  it("shows each index's latest value with its period and when it was refreshed", async () => {
    stubBackend({ status: FRESH_STATUS, histories: HISTORIES });

    renderAt("/indices");

    const expected = [
      {
        name: "TR",
        value: "0,0299%",
        period: "01/03/2024 a 03/03/2024",
        refreshed: "25/10/2026 18:23",
      },
      {
        name: "Remuneração da poupança",
        value: "0,6115%",
        period: "01/03/2024 a 01/04/2024",
        refreshed: "25/10/2026 18:23",
      },
      { name: "Selic meta", value: "10,75%", period: "20/03/2024", refreshed: "25/10/2026 18:23" },
      {
        name: "Selic diária",
        value: "0,040168%",
        period: "20/03/2024",
        refreshed: "25/10/2026 18:23",
      },
      { name: "IPCA", value: "-0,32%", period: "01/02/2024", refreshed: "25/10/2026 18:23" },
      {
        name: "IPCA (número-índice)",
        value: "6.927,85",
        period: "01/02/2024",
        refreshed: "25/10/2026 18:23",
      },
    ];
    for (const { name, value, period, refreshed } of expected) {
      const card = within(await screen.findByRole("region", { name }));
      expect(await card.findByText(value)).toBeInTheDocument();
      expect(card.getByText(period)).toBeInTheDocument();
      expect(card.getByText(`Atualizado em ${refreshed}`)).toBeInTheDocument();
    }
  });

  it("says an index was never refreshed", async () => {
    stubBackend({
      status: {
        ...FRESH_STATUS,
        indexes: FRESH_STATUS.indexes.map((s) =>
          s.index === "ipca" ? { index: "ipca", status: "missing" } : s,
        ),
      },
      histories: { ...HISTORIES, ipca: [] },
    });

    renderAt("/indices");

    const card = within(await screen.findByRole("region", { name: "IPCA" }));
    expect(card.getByText("Nunca atualizado")).toBeInTheDocument();
  });
});

describe("history chart", () => {
  it("plots every index's history under an accessible name, and the projection with it", async () => {
    stubBackend({ status: FRESH_STATUS, histories: HISTORIES });

    renderAt("/indices");

    const names = {
      TR: "Histórico e projeção de TR",
      "Remuneração da poupança": "Histórico e projeção de Remuneração da poupança",
      "Selic meta": "Histórico e projeção de Selic meta",
      "Selic diária": "Histórico de Selic diária",
      IPCA: "Histórico e projeção de IPCA",
      "IPCA (número-índice)": "Histórico de IPCA (número-índice)",
    };
    for (const [name, label] of Object.entries(names)) {
      const card = within(await screen.findByRole("region", { name }));
      expect(await card.findByRole("img", { name: label })).toBeInTheDocument();
    }
  });

  it("labels the chart as history only while the projection has no values", async () => {
    stubBackend({ projections: { ...PROJECTIONS, tr: [] } });

    renderAt("/indices");

    const tr = within(await screen.findByRole("region", { name: "TR" }));
    expect(await tr.findByRole("img", { name: "Histórico de TR" })).toBeInTheDocument();
    const ipca = within(screen.getByRole("region", { name: "IPCA" }));
    expect(
      await ipca.findByRole("img", { name: "Histórico e projeção de IPCA" }),
    ).toBeInTheDocument();
  });

  it("requests the projection of the indexes that are projected only", async () => {
    const requests = stubBackend({});

    renderAt("/indices");
    for (const name of ["TR", "Remuneração da poupança", "Selic meta", "IPCA"]) {
      const card = within(await screen.findByRole("region", { name }));
      expect(
        await card.findByRole("img", { name: `Histórico e projeção de ${name}` }),
      ).toBeInTheDocument();
    }
    await screen.findByRole("img", { name: "Histórico de IPCA (número-índice)" });

    expect(requests).toEqual(INITIAL_REQUESTS);
  });

  it("says the projection could not be loaded and still draws the history", async () => {
    stubBackend(
      {},
      {
        "GET /api/indexes/:index/projection": (_req, { index }) =>
          index === "tr"
            ? problem(503, "Service Unavailable", "database is unavailable")
            : Response.json({ index, values: PROJECTIONS[index] ?? [] }),
      },
    );

    renderAt("/indices");

    const tr = within(await screen.findByRole("region", { name: "TR" }));
    expect(await tr.findByRole("alert")).toHaveTextContent("Não foi possível carregar a projeção.");
    expect(await tr.findByRole("img", { name: "Histórico de TR" })).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("draws no chart for an index without values", async () => {
    stubBackend({
      status: {
        ...FRESH_STATUS,
        indexes: FRESH_STATUS.indexes.map((s) =>
          s.index === "ipca" ? { index: "ipca", status: "missing" } : s,
        ),
      },
      histories: { ...HISTORIES, ipca: [] },
    });

    renderAt("/indices");

    const ipca = within(await screen.findByRole("region", { name: "IPCA" }));
    const tr = within(screen.getByRole("region", { name: "TR" }));
    expect(await tr.findByRole("img", { name: "Histórico e projeção de TR" })).toBeInTheDocument();
    expect(ipca.queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("warnings", () => {
  function withStatuses(...overrides: MarketDataStatus["indexes"]): Partial<Backend> {
    return {
      status: {
        ...FRESH_STATUS,
        indexes: FRESH_STATUS.indexes.map((s) => overrides.find((o) => o.index === s.index) ?? s),
      },
      histories: HISTORIES,
    };
  }

  it("shows no warning while every index is fresh", async () => {
    stubBackend({ status: FRESH_STATUS, histories: HISTORIES });

    renderAt("/indices");

    expect(await screen.findByText("0,0299%")).toBeInTheDocument();
    expect(screen.queryAllByRole("alert")).toEqual([]);
  });

  it("warns that stale data is more than a day old", async () => {
    stubBackend(
      withStatuses({ index: "selic", status: "stale", refreshed_at: "2026-10-23T09:05:00Z" }),
    );

    renderAt("/indices");

    const card = within(await screen.findByRole("region", { name: "Selic diária" }));
    expect(await card.findByRole("alert")).toHaveTextContent(
      "Dados desatualizados: a última atualização foi há mais de dois dias.",
    );
    expect(card.getByText("Atualizado em 23/10/2026 09:05")).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("warns when the latest refresh failed and still shows the last values", async () => {
    stubBackend(
      withStatuses({
        index: "selic_target",
        status: "failed",
        refreshed_at: "2026-10-24T18:23:41Z",
        failed_at: "2026-10-25T17:00:07Z",
      }),
    );

    renderAt("/indices");

    const card = within(await screen.findByRole("region", { name: "Selic meta" }));
    expect(await card.findByRole("alert")).toHaveTextContent(
      "A última atualização falhou em 25/10/2026 17:00.",
    );
    expect(card.getByText("Atualizado em 24/10/2026 18:23")).toBeInTheDocument();
    expect(card.getByText("10,75%")).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("warns when an index failed before it ever succeeded", async () => {
    stubBackend({
      ...withStatuses({ index: "ipca", status: "failed", failed_at: "2026-10-25T17:00:07Z" }),
      histories: { ...HISTORIES, ipca: [] },
    });

    renderAt("/indices");

    const card = within(await screen.findByRole("region", { name: "IPCA" }));
    expect(await card.findByRole("alert")).toHaveTextContent(
      "A última atualização falhou em 25/10/2026 17:00.",
    );
    expect(card.getByText("Nunca atualizado")).toBeInTheDocument();
    expect(card.queryByRole("img")).not.toBeInTheDocument();
  });

  it("warns that an index has no data yet", async () => {
    stubBackend({
      ...withStatuses({ index: "poupanca_yield", status: "missing" }),
      histories: { ...HISTORIES, poupanca_yield: [] },
    });

    renderAt("/indices");

    const card = within(await screen.findByRole("region", { name: "Remuneração da poupança" }));
    expect(await card.findByRole("alert")).toHaveTextContent("Ainda não há dados deste índice.");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("warns that the Focus expectations are stale", async () => {
    stubBackend({
      status: { ...FRESH_STATUS, focus: { status: "stale", refreshed_at: "2026-10-23T09:05:00Z" } },
    });

    renderAt("/indices");

    const alert = within(await screen.findByRole("alert"));
    expect(alert.getByText("Expectativas do Focus")).toBeInTheDocument();
    expect(
      alert.getByText("Dados desatualizados: a última atualização foi há mais de dois dias."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("warns that the latest refresh of the Focus expectations failed", async () => {
    stubBackend({
      status: {
        ...FRESH_STATUS,
        focus: {
          status: "failed",
          refreshed_at: "2026-10-24T18:24:30Z",
          failed_at: "2026-10-25T17:00:07Z",
        },
      },
    });

    renderAt("/indices");

    const alert = within(await screen.findByRole("alert"));
    expect(alert.getByText("Expectativas do Focus")).toBeInTheDocument();
    expect(alert.getByText("A última atualização falhou em 25/10/2026 17:00.")).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("warns that there are no Focus expectations yet", async () => {
    stubBackend({ status: { ...FRESH_STATUS, focus: { status: "missing" } } });

    renderAt("/indices");

    const alert = within(await screen.findByRole("alert"));
    expect(alert.getByText("Expectativas do Focus")).toBeInTheDocument();
    expect(alert.getByText("Ainda não há expectativas do Focus.")).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});

describe("refresh", () => {
  const HISTORY_PATHS = [
    "/api/indexes/tr/history",
    "/api/indexes/poupanca_yield/history",
    "/api/indexes/selic_target/history",
    "/api/indexes/selic/history",
    "/api/indexes/ipca/history",
    "/api/indexes/ipca_number/history",
  ];
  const PROJECTION_PATHS = [
    "/api/indexes/tr/projection",
    "/api/indexes/poupanca_yield/projection",
    "/api/indexes/selic_target/projection",
    "/api/indexes/ipca/projection",
  ];

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts a refresh, shows it running, and loads the new values when it ends", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const statuses = [
      { ...FRESH_STATUS, refreshing: true },
      {
        ...FRESH_STATUS,
        indexes: FRESH_STATUS.indexes.map((s) =>
          s.index === "tr" ? { ...s, refreshed_at: "2026-10-25T18:30:00Z" } : s,
        ),
      },
    ];
    let refreshed = false;
    const requests = stubRoutes({
      "GET /api/market-data/status": () => {
        if (!refreshed) return Response.json(FRESH_STATUS);
        // The first poll still finds the refresh running; the second finds it done.
        const status = statuses.shift() ?? FRESH_STATUS;
        return Response.json(status);
      },
      "POST /api/market-data/refresh": () => {
        refreshed = true;
        return Response.json({ ...FRESH_STATUS, refreshing: true }, { status: 202 });
      },
      ...projectionRoutes(),
      ...Object.fromEntries(
        Object.keys(HISTORIES).map((index) => [
          `GET /api/indexes/${index}/history`,
          () =>
            Response.json({
              index,
              values:
                index === "tr" && statuses.length === 0
                  ? [...TR_VALUES, value("2024-03-01", "2024-03-04", "0.0285")]
                  : HISTORIES[index],
            }),
        ]),
      ),
    });

    renderAt("/indices");
    expect(await screen.findByText("0,0299%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));

    const running = await screen.findByRole("button", { name: "Atualizando…" });
    expect(running).toBeDisabled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(screen.getByRole("button", { name: "Atualizando…" })).toBeDisabled();
    await vi.advanceTimersByTimeAsync(2000);

    expect(await screen.findByText("0,0285%")).toBeInTheDocument();
    expect(screen.getByText("01/03/2024 a 04/03/2024")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atualizar" })).toBeEnabled();
    const tr = within(screen.getByRole("region", { name: "TR" }));
    expect(tr.getByText("Atualizado em 25/10/2026 18:30")).toBeInTheDocument();
    const expectedRequests = [
      ...INITIAL_REQUESTS,
      { method: "POST", url: new URL("/api/market-data/refresh", origin).href },
      get("/api/market-data/status"),
      get("/api/market-data/status"),
      ...HISTORY_PATHS.map(get),
      ...PROJECTION_PATHS.map(get),
    ];
    expect(requests).toEqual(expectedRequests);

    // The refresh is over, so the page stops polling.
    await vi.advanceTimersByTimeAsync(6000);
    expect(requests).toEqual(expectedRequests);
  });

  it("keeps the button disabled while the refresh request is pending", async () => {
    let answer: (response: Response) => void = () => {};
    const post = new Promise<Response>((resolve) => {
      answer = resolve;
    });
    stubRoutes({
      "GET /api/market-data/status": () => Response.json(FRESH_STATUS),
      "POST /api/market-data/refresh": () => post,
      ...projectionRoutes(),
      ...Object.fromEntries(
        Object.keys(HISTORIES).map((index) => [
          `GET /api/indexes/${index}/history`,
          () => Response.json({ index, values: HISTORIES[index] }),
        ]),
      ),
    });

    renderAt("/indices");
    fireEvent.click(await screen.findByRole("button", { name: "Atualizar" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Atualizar" })).toBeDisabled());
    answer(Response.json({ ...FRESH_STATUS, refreshing: true }, { status: 202 }));
    expect(await screen.findByRole("button", { name: "Atualizando…" })).toBeDisabled();
  });

  it("shows a refresh that another client started", async () => {
    stubBackend({ status: { ...FRESH_STATUS, refreshing: true }, histories: HISTORIES });

    renderAt("/indices");

    expect(await screen.findByRole("button", { name: "Atualizando…" })).toBeDisabled();
  });

  it("says when the refresh could not be started", async () => {
    stubRoutes({
      "GET /api/market-data/status": () => Response.json(FRESH_STATUS),
      "POST /api/market-data/refresh": () =>
        Response.json(
          { title: "Internal Server Error", status: 500, detail: "boom" },
          { status: 500 },
        ),
      ...projectionRoutes(),
      ...Object.fromEntries(
        Object.keys(HISTORIES).map((index) => [
          `GET /api/indexes/${index}/history`,
          () => Response.json({ index, values: HISTORIES[index] }),
        ]),
      ),
    });

    renderAt("/indices");
    fireEvent.click(await screen.findByRole("button", { name: "Atualizar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível iniciar a atualização.",
    );
    expect(screen.getByRole("button", { name: "Atualizar" })).toBeEnabled();
  });
});

describe("load failures", () => {
  const PROBLEM = { title: "Service Unavailable", status: 503, detail: "database is unavailable" };

  it("says the indices could not be loaded when the status fails", async () => {
    stubRoutes({
      "GET /api/market-data/status": () => Response.json(PROBLEM, { status: 503 }),
    });

    renderAt("/indices");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os índices.",
    );
    expect(screen.queryAllByRole("region")).toEqual([]);
  });

  it("says which history could not be loaded and keeps the other cards", async () => {
    stubRoutes({
      "GET /api/market-data/status": () => Response.json(FRESH_STATUS),
      ...projectionRoutes(),
      "GET /api/indexes/tr/history": () => Response.json(PROBLEM, { status: 503 }),
      ...Object.fromEntries(
        Object.keys(HISTORIES)
          .filter((index) => index !== "tr")
          .map((index) => [
            `GET /api/indexes/${index}/history`,
            () => Response.json({ index, values: HISTORIES[index] }),
          ]),
      ),
    });

    renderAt("/indices");

    const tr = within(await screen.findByRole("region", { name: "TR" }));
    expect(await tr.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar o histórico.",
    );
    expect(await screen.findByText("0,6115%")).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});

describe("projection method", () => {
  const METHOD_LABEL = "Método de projeção";
  const TR_OFFERED = ["Média dos últimos 12 meses", "Média dos últimos 60 meses"];
  const ALL_OFFERED = ["Mediana do Focus (BCB)", ...TR_OFFERED];

  async function methodSelect(card: string) {
    return within(await screen.findByRole("region", { name: card })).findByRole("combobox", {
      name: METHOD_LABEL,
    });
  }

  function optionLabels(select: HTMLElement) {
    return within(select)
      .getAllByRole("option")
      .map((option) => option.textContent);
  }

  it("offers each projected index its methods and shows the current one", async () => {
    stubBackend({});

    renderAt("/indices");

    const tr = await methodSelect("TR");
    expect(tr).toHaveDisplayValue("Média dos últimos 12 meses");
    expect(optionLabels(tr)).toEqual(TR_OFFERED);
    const selic = await methodSelect("Selic meta");
    expect(selic).toHaveDisplayValue("Mediana do Focus (BCB)");
    expect(optionLabels(selic)).toEqual(ALL_OFFERED);
    const ipca = await methodSelect("IPCA");
    expect(ipca).toHaveDisplayValue("Mediana do Focus (BCB)");
    expect(optionLabels(ipca)).toEqual(ALL_OFFERED);
    expect(screen.getAllByRole("combobox")).toHaveLength(3);
  });

  it("saves the chosen method, reloads every projection and shows the new method", async () => {
    let tr: ProjectionMethodName = "trailing_12";
    const requests = stubBackend(
      {},
      {
        // The request body is asserted below, from the recorded requests.
        "PUT /api/indexes/tr/projection-method": () => {
          tr = "trailing_60";
          return Response.json({
            index: "tr",
            method: tr,
            offered: ["trailing_12", "trailing_60"],
          });
        },
        "GET /api/indexes/:index/projection": (_req, { index }) =>
          Response.json({
            index,
            values: index === "tr" && tr === "trailing_60" ? TR_60_PROJECTION : PROJECTIONS[index],
          }),
      },
    );

    renderAt("/indices");
    const select = await methodSelect("TR");
    const loaded = requests.length;
    fireEvent.change(select, { target: { value: "trailing_60" } });

    await waitFor(() =>
      expect(requests.slice(loaded)).toEqual([
        {
          method: "PUT",
          url: new URL("/api/indexes/tr/projection-method", origin).href,
          body: { method: "trailing_60" },
        },
        get("/api/indexes/tr/projection"),
        get("/api/indexes/poupanca_yield/projection"),
        get("/api/indexes/selic_target/projection"),
        get("/api/indexes/ipca/projection"),
      ]),
    );
    await waitFor(() => expect(select).toHaveDisplayValue("Média dos últimos 60 meses"));
    expect(
      within(screen.getByRole("region", { name: "Remuneração da poupança" })).getByText(
        "A projeção deriva da TR projetada pela média dos últimos 60 meses e da Selic meta projetada pela mediana do Focus (BCB), segundo a regra da poupança.",
      ),
    ).toBeInTheDocument();
  });

  it("says the method could not be saved and keeps showing the current one", async () => {
    const requests = stubBackend(
      {},
      {
        "PUT /api/indexes/tr/projection-method": () =>
          problem(422, "Unprocessable Entity", "trailing_60 is not offered"),
      },
    );

    renderAt("/indices");
    const select = await methodSelect("TR");
    const loaded = requests.length;
    fireEvent.change(select, { target: { value: "trailing_60" } });

    const tr = within(screen.getByRole("region", { name: "TR" }));
    expect(await tr.findByRole("alert")).toHaveTextContent(
      "Não foi possível salvar o método de projeção.",
    );
    expect(select).toHaveDisplayValue("Média dos últimos 12 meses");
    expect(select).toBeEnabled();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(requests.slice(loaded)).toEqual([
      {
        method: "PUT",
        url: new URL("/api/indexes/tr/projection-method", origin).href,
        body: { method: "trailing_60" },
      },
    ]);
  });

  it("says how the poupança yield is projected, naming the TR and Selic meta methods", async () => {
    stubBackend({});

    renderAt("/indices");

    const card = within(await screen.findByRole("region", { name: "Remuneração da poupança" }));
    expect(
      await card.findByText(
        "A projeção deriva da TR projetada pela média dos últimos 12 meses e da Selic meta projetada pela mediana do Focus (BCB), segundo a regra da poupança.",
      ),
    ).toBeInTheDocument();
    expect(card.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("says the projection methods could not be loaded", async () => {
    stubBackend(
      {},
      {
        "GET /api/indexes/projection-methods": () =>
          problem(503, "Service Unavailable", "database is unavailable"),
      },
    );

    renderAt("/indices");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os métodos de projeção.",
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    await screen.findByRole("img", { name: "Histórico e projeção de TR" });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
