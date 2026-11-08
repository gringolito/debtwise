import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MortgageTerms } from "@/lib/api";
import { text } from "@/test/dom";
import { stubMortgageApi } from "@/test/mortgageApi";
import { registeredMortgage, schedule } from "@/test/mortgageFixtures";
import { renderAt } from "@/test/renderAt";
import { problem, type RecordedRequest, stubRoutes } from "@/test/stubServer";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const PREVIEW = "/api/mortgage/schedule/preview";

function fill(label: string, value: string, scope: HTMLElement = document.body) {
  fireEvent.change(within(scope).getByLabelText(label), { target: { value } });
}

const next = () => fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
const back = () => fireEvent.click(screen.getByRole("button", { name: "Voltar" }));

async function atStep(step: number) {
  expect(await screen.findByText(`Passo ${step} de 6`)).toBeInTheDocument();
}

async function start() {
  fireEvent.click(await screen.findByRole("button", { name: "Configurar meu financiamento" }));
  await atStep(1);
}

/** Goes on from the current step to the given one, leaving the steps in between as they are. */
async function continueTo(step: number, from: number) {
  for (let current = from; current < step; current++) {
    next();
    await atStep(current + 1);
  }
}

function bodies(requests: RecordedRequest[], method: string, path: string) {
  return requests
    .filter((req) => req.method === method && new URL(req.url).pathname === path)
    .map((req) => req.body);
}

function figures(summary: HTMLElement) {
  return Array.from(summary.querySelectorAll("dt")).map((term) => [
    text(term),
    text(term.nextElementSibling as Element),
  ]);
}

function rows(name: string) {
  return within(screen.getByRole("region", { name }))
    .getAllByRole("listitem")
    .map((item) => Array.from(item.querySelectorAll("span")).map(text));
}

const unprocessable = (...locations: string[]) =>
  problem(
    422,
    "Unprocessable Entity",
    "validation failed",
    locations.map((location) => ({ location, message: "invalid" })),
  );

describe("the gate in front of the app", () => {
  it.each([
    "/",
    "/financiamento",
    "/financiamento/editar",
    "/investimentos",
    "/decidir",
    "/mercado/titulos",
    "/ajustes",
  ])("opens the welcome on %s while no mortgage is registered", async (path) => {
    stubMortgageApi();

    renderAt(path);

    expect(
      await screen.findByRole("heading", { name: "Seu financiamento, com clareza." }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("shows neither the app nor the welcome until it knows whether a mortgage is registered", async () => {
    stubRoutes({ "GET /api/mortgage": () => new Promise<Response>(() => {}) });

    renderAt("/");

    expect(await screen.findByRole("status", { name: "Carregando" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByText("Seu financiamento, com clareza.")).not.toBeInTheDocument();
  });

  it("says the mortgage could not load and opens the app once retrying reads it", async () => {
    let fail = true;
    stubRoutes({
      "GET /api/mortgage": () =>
        fail
          ? problem(500, "Internal Server Error", "unexpected failure")
          : Response.json(registeredMortgage),
    });
    renderAt("/financiamento");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível carregar seu financiamento");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByText("Seu financiamento, com clareza.")).not.toBeInTheDocument();

    fail = false;
    fireEvent.click(within(alert).getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByRole("navigation", { name: "Principal" })).toBeInTheDocument();
  });
});

describe("setting up the mortgage", () => {
  const terms: MortgageTerms = {
    contract_date: "2023-12-10",
    original_amount: "60000.00",
    term_months: 6,
    first_installment_date: "2024-01-10",
    amortization_system: "price",
    indexer: "tr",
    appraisal_value: "100000.00",
    contract_rates: [
      {
        effective_from: "2024-01-10",
        rate: "0.095",
        basis: "effective",
        poupanca_additional: false,
      },
      { effective_from: "2024-04-10", rate: "0.08", basis: "nominal", poupanca_additional: true },
    ],
    mip_rates: [{ effective_from: "2024-01-10", rate: "0.000258" }],
    dfi_rates: [{ effective_from: "2024-01-10", rate: "0.0001" }],
    fees: [{ effective_from: "2024-01-10", amount: "25.90" }],
  };

  /** Answers every step with `terms`, as the owner types them, and stays on the last one. */
  async function fillEveryStep() {
    await start();
    fill("Data do contrato", "2023-12-10");
    fill("Valor financiado", "60000,00");
    expect(screen.getByLabelText("Valor financiado")).toHaveValue("60.000,00");
    fill("Prazo", "6");
    fill("Primeira prestação", "2024-01-10");
    next();
    await atStep(2);
    fireEvent.click(screen.getByRole("radio", { name: "Price" }));
    next();
    await atStep(3);
    fireEvent.click(screen.getByRole("radio", { name: "TR" }));
    next();
    await atStep(4);
    fill("Taxa de juros anual", "9,5");
    fireEvent.click(
      screen.getByRole("button", { name: "A taxa mudou durante o contrato? Adicionar mudança" }),
    );
    const change = screen.getByRole("region", { name: "Mudança 1" });
    fill("A partir de", "2024-04-10", change);
    fill("Taxa", "8", change);
    fireEvent.click(within(change).getByRole("radio", { name: "Nominal" }));
    fireEvent.click(within(change).getByRole("switch", { name: "Parte vinculada à poupança" }));
    next();
    await atStep(5);
    fill("Valor de avaliação", "100.000,00");
    fill("MIP · Morte e invalidez", "0,0258");
    fill("DFI · Danos ao imóvel", "0,01");
    fill("Taxa de administração", "25,90");
  }

  it("shows each step's number and progress, starting on SAC, no indexer and the effective basis", async () => {
    stubMortgageApi();
    renderAt("/");
    const progress = () => screen.getByRole("progressbar", { name: "Progresso da configuração" });

    await start();
    expect(progress()).toHaveAttribute("aria-valuemax", "6");
    expect(progress()).toHaveAttribute("aria-valuenow", "1");
    await continueTo(2, 1);
    expect(progress()).toHaveAttribute("aria-valuenow", "2");
    expect(screen.getByRole("radio", { name: "SAC" })).toBeChecked();
    await continueTo(3, 2);
    expect(progress()).toHaveAttribute("aria-valuenow", "3");
    expect(screen.getAllByRole("radio")).toEqual(
      ["TR", "IPCA", "Nenhum"].map((name) => screen.getByRole("radio", { name })),
    );
    expect(screen.getByRole("radio", { name: "Nenhum" })).toBeChecked();
    await continueTo(4, 3);
    expect(progress()).toHaveAttribute("aria-valuenow", "4");
    expect(screen.getByRole("radio", { name: "Efetiva" })).toBeChecked();
    await continueTo(6, 4);
    expect(progress()).toHaveAttribute("aria-valuenow", "6");
  });

  it("keeps what was typed on every step when going back", async () => {
    stubMortgageApi();
    renderAt("/");

    await fillEveryStep();
    back();
    await atStep(4);
    expect(screen.getByLabelText("Taxa de juros anual")).toHaveValue("9,5");
    const change = screen.getByRole("region", { name: "Mudança 1" });
    expect(within(change).getByLabelText("A partir de")).toHaveValue("2024-04-10");
    expect(within(change).getByLabelText("Taxa")).toHaveValue("8");
    expect(within(change).getByRole("radio", { name: "Nominal" })).toBeChecked();
    expect(
      within(change).getByRole("switch", { name: "Parte vinculada à poupança" }),
    ).toBeChecked();
    back();
    await atStep(3);
    expect(screen.getByRole("radio", { name: "TR" })).toBeChecked();
    back();
    await atStep(2);
    expect(screen.getByRole("radio", { name: "Price" })).toBeChecked();
    back();
    await atStep(1);
    expect(screen.getByLabelText("Data do contrato")).toHaveValue("2023-12-10");
    expect(screen.getByLabelText("Valor financiado")).toHaveValue("60.000,00");
    expect(screen.getByLabelText("Prazo")).toHaveValue("6");
    expect(screen.getByLabelText("Primeira prestação")).toHaveValue("2024-01-10");
    back();
    fireEvent.click(await screen.findByRole("button", { name: "Configurar meu financiamento" }));
    await continueTo(5, 1);
    expect(screen.getByLabelText("Valor de avaliação")).toHaveValue("100.000,00");
    expect(screen.getByLabelText("MIP · Morte e invalidez")).toHaveValue("0,0258");
    expect(screen.getByLabelText("DFI · Danos ao imóvel")).toHaveValue("0,01");
    expect(screen.getByLabelText("Taxa de administração")).toHaveValue("25,90");
  });

  it("reviews the schedule previewed for the terms, then saves them and opens Início", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2024, 2, 20, 9, 30));
    const requests = stubMortgageApi({ onSave: () => registeredMortgage });
    renderAt("/decidir");

    await fillEveryStep();
    next();

    expect(await screen.findByRole("heading", { name: "Tudo pronto." })).toBeInTheDocument();
    expect(bodies(requests, "POST", PREVIEW)).toEqual([terms]);
    expect(bodies(requests, "PUT", "/api/mortgage")).toEqual([]);
    const summary = screen.getByRole("region", { name: "Resumo" });
    expect(figures(summary)).toEqual([
      ["Quitação prevista", "junho de 2024"],
      ["Prestação atual", "R$ 10.434,50"],
    ]);
    expect(
      within(summary).getByRole("img", { name: "Saldo devedor ao longo do tempo" }),
    ).toBeInTheDocument();
    expect(rows("Parâmetros informados")).toEqual([
      ["Contrato", "R$ 60.000,00 · 6 meses"],
      ["Sistema", "Price"],
      ["Correção", "TR"],
      ["Juros", "9,50% ao ano (efetiva) · 1 mudança"],
      ["Seguros e taxas", "MIP 0,0258% · DFI 0,01% · R$ 25,90"],
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));

    const nav = await screen.findByRole("navigation", { name: "Principal" });
    expect(within(nav).getByRole("link", { name: "Início" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(bodies(requests, "PUT", "/api/mortgage")).toEqual([terms]);
  });

  it("goes back from the review to the last step, or with Editar to the first, keeping the terms", async () => {
    stubMortgageApi();
    renderAt("/");

    await fillEveryStep();
    next();
    await screen.findByRole("heading", { name: "Tudo pronto." });
    back();
    await atStep(5);
    expect(screen.getByLabelText("Valor de avaliação")).toHaveValue("100.000,00");

    next();
    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    await atStep(1);
    expect(screen.getByLabelText("Valor financiado")).toHaveValue("60.000,00");
  });

  it("calls the first installment the current one until it is due", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2024, 0, 9, 23, 55));
    stubMortgageApi();
    renderAt("/");

    await start();
    await continueTo(5, 1);
    next();

    const summary = await screen.findByRole("region", { name: "Resumo" });
    expect(figures(summary)).toEqual([
      ["Quitação prevista", "junho de 2024"],
      ["Primeira prestação", "R$ 10.640,50"],
    ]);
  });

  it("sends text the API cannot read as typed, and an empty admin fee as none", async () => {
    const requests = stubMortgageApi({ onPreview: () => unprocessable("body.original_amount") });
    renderAt("/");

    await start();
    fill("Valor financiado", "muito");
    await continueTo(4, 1);
    fill("Taxa de juros anual", "alta");
    await continueTo(5, 4);
    next();

    await atStep(1);
    expect(bodies(requests, "POST", PREVIEW)).toEqual([
      {
        contract_date: "",
        original_amount: "muito",
        term_months: null,
        first_installment_date: "",
        amortization_system: "sac",
        indexer: "none",
        appraisal_value: "",
        contract_rates: [
          { effective_from: "", rate: "alta", basis: "effective", poupanca_additional: false },
        ],
        mip_rates: [{ effective_from: "", rate: "" }],
        dfi_rates: [{ effective_from: "", rate: "" }],
        fees: [{ effective_from: "", amount: "0" }],
      },
    ]);
  });
});

describe("the insurance rates from the first installment", () => {
  it("derives MIP and DFI from what each charged, once the amount each is charged on is there", async () => {
    const requests = stubMortgageApi();
    renderAt("/");

    await start();
    await continueTo(5, 1);
    expect(screen.queryByLabelText("MIP cobrado")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Não sei a taxa. Usar o valor da primeira prestação" }),
    );
    const mip = screen.getByLabelText("MIP cobrado");
    const dfi = screen.getByLabelText("DFI cobrado");
    expect(mip).toHaveAccessibleDescription("Preencha o valor financiado para calcular a taxa.");
    expect(dfi).toHaveAccessibleDescription("Preencha o valor de avaliação para calcular a taxa.");
    fill("MIP cobrado", "15,48");
    fill("DFI cobrado", "33,50");
    expect(screen.getByLabelText("MIP · Morte e invalidez")).toHaveValue("");
    expect(screen.getByLabelText("DFI · Danos ao imóvel")).toHaveValue("");

    fill("Valor de avaliação", "100.000,00");
    expect(screen.getByLabelText("DFI cobrado")).not.toHaveAccessibleDescription();
    expect(screen.getByLabelText("DFI · Danos ao imóvel")).toHaveValue("0,0335");

    for (let step = 5; step > 1; step--) {
      back();
      await atStep(step - 1);
    }
    fill("Valor financiado", "60.000,00");
    await continueTo(5, 1);
    expect(screen.getByLabelText("MIP cobrado")).toHaveValue("15,48");
    expect(screen.getByLabelText("MIP cobrado")).not.toHaveAccessibleDescription();
    expect(screen.getByLabelText("MIP · Morte e invalidez")).toHaveValue("0,0258");
    next();

    await screen.findByRole("heading", { name: "Tudo pronto." });
    expect(bodies(requests, "POST", PREVIEW)).toEqual([
      expect.objectContaining({
        mip_rates: [{ effective_from: "", rate: "0.000258" }],
        dfi_rates: [{ effective_from: "", rate: "0.000335" }],
      }),
    ]);
  });

  it("keeps the rate the owner types over the derived one and drops the charge", async () => {
    stubMortgageApi();
    renderAt("/");

    await start();
    await continueTo(5, 1);
    fireEvent.click(
      screen.getByRole("button", { name: "Não sei a taxa. Usar o valor da primeira prestação" }),
    );
    fill("Valor de avaliação", "100.000,00");
    fill("DFI cobrado", "33,50");
    fill("DFI · Danos ao imóvel", "0,034");

    expect(screen.getByLabelText("DFI cobrado")).toHaveValue("");
    expect(screen.getByLabelText("DFI · Danos ao imóvel")).toHaveValue("0,034");
  });
});

describe("a mortgage the API rejects", () => {
  it("returns from the review to the first step that asks for a rejected field", async () => {
    const requests = stubMortgageApi({
      onSave: () => unprocessable("body.fees[0].amount", "body.contract_rates[1].effective_from"),
    });
    renderAt("/");

    await start();
    await continueTo(4, 1);
    fireEvent.click(
      screen.getByRole("button", { name: "A taxa mudou durante o contrato? Adicionar mudança" }),
    );
    await continueTo(5, 4);
    next();
    fireEvent.click(await screen.findByRole("button", { name: "Concluir" }));

    await atStep(4);
    expect(screen.getByRole("alert")).toHaveTextContent("Confira os campos destacados.");
    const change = screen.getByRole("region", { name: "Mudança 1" });
    expect(within(change).getByLabelText("A partir de")).toHaveAttribute("aria-invalid", "true");
    expect(within(change).getByLabelText("A partir de")).toHaveAccessibleDescription(
      "Valor inválido.",
    );
    expect(within(change).getByLabelText("Taxa")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Taxa de juros anual")).not.toHaveAttribute("aria-invalid");

    next();
    await atStep(5);
    expect(screen.getByLabelText("Taxa de administração")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Valor de avaliação")).not.toHaveAttribute("aria-invalid");
    expect(bodies(requests, "PUT", "/api/mortgage")).toHaveLength(1);
  });

  it("drops the highlights once a rate change is added or removed, since they named rows", async () => {
    stubMortgageApi({ onPreview: () => unprocessable("body.contract_rates[1].rate") });
    renderAt("/");

    await start();
    await continueTo(4, 1);
    fireEvent.click(
      screen.getByRole("button", { name: "A taxa mudou durante o contrato? Adicionar mudança" }),
    );
    await continueTo(5, 4);
    next();

    await atStep(4);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    const change = screen.getByRole("region", { name: "Mudança 1" });
    fireEvent.click(within(change).getByRole("button", { name: "Remover" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Mudança 1" })).not.toBeInTheDocument();
  });

  it.each([
    [
      "the review",
      { onPreview: () => problem(500, "Internal Server Error", "boom") },
      5,
      "Não foi possível calcular o financiamento. Tente novamente.",
    ],
    [
      "saving",
      { onSave: () => problem(500, "Internal Server Error", "boom") },
      6,
      "Não foi possível salvar o financiamento. Tente novamente.",
    ],
  ])("says %s failed on the step it was asked from", async (_, api, step, message) => {
    stubMortgageApi(api);
    renderAt("/");

    await start();
    await continueTo(5, 1);
    next();
    if (step === 6) fireEvent.click(await screen.findByRole("button", { name: "Concluir" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    await atStep(step);
  });
});

describe("the schedule the review shows", () => {
  it("is the one the API previews for the terms", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2024, 2, 20, 9, 30));
    stubMortgageApi({
      onPreview: () => ({ installments: schedule.installments.slice(0, 2) }),
    });
    renderAt("/");

    await start();
    await continueTo(5, 1);
    next();

    const summary = await screen.findByRole("region", { name: "Resumo" });
    expect(figures(summary)).toEqual([
      ["Quitação prevista", "fevereiro de 2024"],
      ["Prestação atual", "R$ 10.537,50"],
    ]);
  });
});
