import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MortgageTerms } from "@/lib/api";
import { text } from "@/test/dom";
import { stubMortgageApi } from "@/test/mortgageApi";
import { registeredMortgage, schedule, trSchedule } from "@/test/mortgageFixtures";
import { closeWelcome } from "@/test/onboarding";
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

/** What the owner types to answer each numbered step, as little as the step asks for. */
const answers: Record<number, () => void> = {
  1: () => {
    fill("Data do contrato", "10/12/2023");
    fill("Valor financiado", "60.000,00");
    fill("Prazo", "6");
    fill("Primeira prestação", "10/01/2024");
  },
  2: () => {},
  3: () => fireEvent.click(screen.getByRole("radio", { name: "TR" })),
  4: () => fill("Taxa de juros anual", "9,5"),
  5: () => {
    fill("Valor de avaliação", "100.000,00");
    fill("MIP · Morte e invalidez", "0,0258");
    fill("DFI · Danos ao imóvel", "0,01");
  },
};

/** Goes on from the step to the given one, answering each step it leaves. */
async function continueTo(step: number, from: number) {
  for (let current = from; current < step; current++) {
    answers[current]();
    next();
    await atStep(current + 1);
  }
}

/** Answers the last numbered step and goes on to the review. */
async function review() {
  answers[5]();
  next();
  await screen.findByRole("heading", { name: "Tudo pronto." });
}

function addRateChange(date: string, rate: string) {
  fireEvent.click(
    screen.getByRole("button", { name: "A taxa mudou durante o contrato? Adicionar mudança" }),
  );
  const change = screen.getByRole("region", { name: "Mudança 1" });
  fill("A partir de", date, change);
  fill("Taxa", rate, change);
  return change;
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
    "/comparar",
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

  it("shows the shell with Início's skeleton, not the welcome, while it learns whether a mortgage is registered", async () => {
    stubRoutes({ "GET /api/mortgage": () => new Promise<Response>(() => {}) });

    renderAt("/");

    expect(await screen.findByRole("status", { name: "Carregando início" })).toBeInTheDocument();
    expect(screen.getAllByRole("navigation", { name: "Principal" })).toHaveLength(2);
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

    expect(
      await screen.findByRole("heading", { level: 1, name: "Financiamento" }),
    ).toBeInTheDocument();
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
    fill("Data do contrato", "10/12/2023");
    fill("Valor financiado", "60000,00");
    expect(screen.getByLabelText("Valor financiado")).toHaveValue("60.000,00");
    fill("Prazo", "6");
    fill("Primeira prestação", "10/01/2024");
    next();
    await atStep(2);
    fireEvent.click(screen.getByRole("radio", { name: "Price" }));
    next();
    await atStep(3);
    fireEvent.click(screen.getByRole("radio", { name: "TR" }));
    next();
    await atStep(4);
    fill("Taxa de juros anual", "9,5");
    const change = addRateChange("10/04/2024", "8");
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
    for (const radio of screen.getAllByRole("radio")) expect(radio).not.toBeChecked();
    await continueTo(4, 3);
    expect(progress()).toHaveAttribute("aria-valuenow", "4");
    expect(screen.getByRole("radio", { name: "Efetiva" })).toBeChecked();
    await continueTo(5, 4);
    expect(progress()).toHaveAttribute("aria-valuenow", "5");
    await review();
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
    expect(within(change).getByLabelText("A partir de")).toHaveValue("10/04/2024");
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
    expect(screen.getByLabelText("Data do contrato")).toHaveValue("10/12/2023");
    expect(screen.getByLabelText("Valor financiado")).toHaveValue("60.000,00");
    expect(screen.getByLabelText("Prazo")).toHaveValue("6");
    expect(screen.getByLabelText("Primeira prestação")).toHaveValue("10/01/2024");
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
    renderAt("/comparar");

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
    await closeWelcome();

    const [nav] = await screen.findAllByRole("navigation", { name: "Principal" });
    expect(within(nav).getByRole("link", { name: "Início" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(bodies(requests, "PUT", "/api/mortgage")).toEqual([terms]);
  });

  it("welcomes the owner with the registered mortgage's payoff and the next step", async () => {
    stubMortgageApi({ onSave: () => registeredMortgage, scheduleAfterSave: trSchedule });
    renderAt("/");

    await fillEveryStep();
    next();
    fireEvent.click(await screen.findByRole("button", { name: "Concluir" }));

    const welcome = await screen.findByRole("dialog", { name: "Financiamento configurado!" });
    expect(figures(welcome)).toEqual([["Quitação prevista", "março de 2024"]]);
    expect(welcome).toHaveTextContent(
      "Próximo passo: registre uma amortização ou um investimento.",
    );
    expect(welcome).not.toHaveTextContent("*");
    fireEvent.click(within(welcome).getByRole("button", { name: "Continuar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findAllByRole("navigation", { name: "Principal" })).toHaveLength(2);
  });

  it("opens Início and the welcome together, once the registered schedule has loaded", async () => {
    let serve = () => {};
    const served = new Promise<void>((resolve) => {
      serve = resolve;
    });
    const requests = stubMortgageApi({
      onSave: () => registeredMortgage,
      routes: {
        "GET /api/mortgage/schedule": async () => {
          await served;
          return Response.json(trSchedule);
        },
      },
    });
    renderAt("/");

    await fillEveryStep();
    next();
    fireEvent.click(await screen.findByRole("button", { name: "Concluir" }));

    await waitFor(() =>
      expect(requests.some((req) => new URL(req.url).pathname === "/api/mortgage/schedule")).toBe(
        true,
      ),
    );
    expect(document.querySelector("nav")).toBeNull();
    serve();
    await waitFor(() => expect(document.querySelector("nav")).not.toBeNull());
    expect(screen.getByRole("dialog", { name: "Financiamento configurado!" })).toBeInTheDocument();
  });

  it("goes back from the review to the last step, keeping the terms", async () => {
    stubMortgageApi();
    renderAt("/");

    await fillEveryStep();
    next();
    await screen.findByRole("heading", { name: "Tudo pronto." });
    back();

    await atStep(5);
    expect(screen.getByLabelText("Valor de avaliação")).toHaveValue("100.000,00");
  });

  it("calls the first installment the current one until it is due", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2024, 0, 9, 23, 55));
    stubMortgageApi();
    renderAt("/");

    await start();
    await continueTo(5, 1);
    await review();

    const summary = screen.getByRole("region", { name: "Resumo" });
    expect(figures(summary)).toEqual([
      ["Quitação prevista", "junho de 2024"],
      ["Primeira prestação", "R$ 10.640,50"],
    ]);
  });

  it("sends the terms in force from the first installment, and an empty admin fee as none", async () => {
    const requests = stubMortgageApi();
    renderAt("/");

    await start();
    await continueTo(5, 1);
    await review();

    expect(bodies(requests, "POST", PREVIEW)).toEqual([
      {
        contract_date: "2023-12-10",
        original_amount: "60000.00",
        term_months: 6,
        first_installment_date: "2024-01-10",
        amortization_system: "sac",
        indexer: "tr",
        appraisal_value: "100000.00",
        contract_rates: [
          {
            effective_from: "2024-01-10",
            rate: "0.095",
            basis: "effective",
            poupanca_additional: false,
          },
        ],
        mip_rates: [{ effective_from: "2024-01-10", rate: "0.000258" }],
        dfi_rates: [{ effective_from: "2024-01-10", rate: "0.0001" }],
        fees: [{ effective_from: "2024-01-10", amount: "0" }],
      },
    ]);
  });
});

describe("a step that cannot go on yet", () => {
  it("stays on an empty first step, says what each field needs and focuses the first", async () => {
    const requests = stubMortgageApi();
    renderAt("/");

    await start();
    next();

    await atStep(1);
    expect(screen.getByLabelText("Data do contrato")).toHaveAccessibleDescription(
      "Informe a data do contrato.",
    );
    expect(screen.getByLabelText("Valor financiado")).toHaveAccessibleDescription(
      expect.stringContaining("Informe o valor financiado."),
    );
    expect(screen.getByLabelText("Prazo")).toHaveAccessibleDescription(
      "Informe o prazo em meses, como 420.",
    );
    expect(screen.getByLabelText("Primeira prestação")).toHaveAccessibleDescription(
      "Informe a data da primeira prestação.",
    );
    expect(screen.getByLabelText("Data do contrato")).toHaveFocus();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(bodies(requests, "POST", PREVIEW)).toEqual([]);
  });

  it("focuses the first field that is invalid, not the first on the step", async () => {
    stubMortgageApi();
    renderAt("/");
    await start();
    fill("Data do contrato", "10/12/2023");
    fill("Valor financiado", "60.000,00");

    next();

    expect(screen.getByLabelText("Prazo")).toHaveFocus();
    expect(screen.getByLabelText("Data do contrato")).not.toHaveAttribute("aria-invalid");
  });

  it("clears each message as soon as its field changes, and only that one's", async () => {
    stubMortgageApi();
    renderAt("/");
    await start();
    next();

    fill("Prazo", "6");
    expect(screen.getByLabelText("Prazo")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Prazo")).not.toHaveAccessibleDescription();
    expect(screen.getByLabelText("Data do contrato")).toHaveAttribute("aria-invalid", "true");

    fill("Valor financiado", "60.000,00");
    expect(screen.getByLabelText("Valor financiado")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Primeira prestação")).toHaveAttribute("aria-invalid", "true");
  });

  it("asks the first installment to come on or after the contract date, and rechecks when either date changes", async () => {
    stubMortgageApi();
    renderAt("/");
    await start();
    answers[1]();
    fill("Primeira prestação", "09/12/2023");

    next();

    await atStep(1);
    expect(screen.getByLabelText("Primeira prestação")).toHaveAccessibleDescription(
      "A primeira prestação não pode ser antes da data do contrato.",
    );
    expect(screen.getByLabelText("Primeira prestação")).toHaveFocus();
    fill("Data do contrato", "01/12/2023");
    expect(screen.getByLabelText("Primeira prestação")).not.toHaveAttribute("aria-invalid");
    next();
    await atStep(2);
  });

  it.each([
    ["a term over 600 months", () => fill("Prazo", "601"), "O prazo vai de 1 a 600 meses."],
    ["a term that is no whole number", () => fill("Prazo", "6,5"), "O prazo é em meses, como 420."],
    [
      "an amount of zero",
      () => fill("Valor financiado", "0,00"),
      "O valor financiado precisa ser maior que zero.",
    ],
  ])("blocks %s", async (_, change, message) => {
    stubMortgageApi();
    renderAt("/");
    await start();
    answers[1]();
    change();

    next();

    await atStep(1);
    expect(screen.getAllByText(message)).toHaveLength(1);
  });

  it("starts the correction with nothing chosen, asks for a choice and focuses its first radio", async () => {
    stubMortgageApi();
    renderAt("/");
    await start();
    await continueTo(3, 1);

    next();

    await atStep(3);
    const choices = screen.getByRole("radiogroup", { name: "Índice de correção" });
    expect(choices).toHaveAttribute("aria-invalid", "true");
    expect(choices).toHaveAccessibleDescription("Escolha como o saldo é corrigido.");
    expect(screen.getByRole("radio", { name: "TR" })).toHaveFocus();

    fireEvent.click(screen.getByRole("radio", { name: "IPCA" }));
    expect(choices).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Escolha como o saldo é corrigido.")).not.toBeInTheDocument();
    next();
    await atStep(4);
  });

  it("asks for the date and the rate of a change by its place, on the step that has it", async () => {
    stubMortgageApi();
    renderAt("/");
    await start();
    await continueTo(4, 1);
    fill("Taxa de juros anual", "9,5");
    fireEvent.click(
      screen.getByRole("button", { name: "A taxa mudou durante o contrato? Adicionar mudança" }),
    );

    next();

    await atStep(4);
    const change = screen.getByRole("region", { name: "Mudança 1" });
    expect(within(change).getByLabelText("A partir de")).toHaveAccessibleDescription(
      "Informe a data da mudança.",
    );
    expect(within(change).getByLabelText("Taxa")).toHaveAccessibleDescription(
      "Informe a nova taxa, como 9,5.",
    );
    expect(screen.getByLabelText("Taxa de juros anual")).not.toHaveAttribute("aria-invalid");
    expect(within(change).getByLabelText("A partir de")).toHaveFocus();
  });

  it("asks the insurance step for the appraisal value and both rates, not for the admin fee", async () => {
    stubMortgageApi();
    renderAt("/");
    await start();
    await continueTo(5, 1);

    next();

    await atStep(5);
    expect(screen.getByLabelText("Valor de avaliação")).toHaveAccessibleDescription(
      expect.stringContaining("Informe o valor de avaliação do imóvel."),
    );
    expect(screen.getByLabelText("MIP · Morte e invalidez")).toHaveAccessibleDescription(
      expect.stringContaining("Informe a taxa do MIP ao mês, como 0,03."),
    );
    expect(screen.getByLabelText("DFI · Danos ao imóvel")).toHaveAccessibleDescription(
      expect.stringContaining("Informe a taxa do DFI ao mês, como 0,03."),
    );
    expect(screen.getByLabelText("Taxa de administração")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Valor de avaliação")).toHaveFocus();
  });

  it("asks the API only once the browser finds nothing wrong", async () => {
    const requests = stubMortgageApi();
    renderAt("/");
    await start();
    await continueTo(5, 1);

    next();
    expect(bodies(requests, "POST", PREVIEW)).toEqual([]);

    await review();
    expect(bodies(requests, "POST", PREVIEW)).toHaveLength(1);
  });
});

describe("the review's rows", () => {
  async function atReview() {
    const requests = stubMortgageApi();
    renderAt("/");
    await start();
    await continueTo(5, 1);
    await review();
    return requests;
  }

  it("open their step, and Continuar there returns to the review with the schedule previewed again", async () => {
    const requests = await atReview();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Juros/ }));
    await atStep(4);
    expect(screen.getByLabelText("Taxa de juros anual")).toHaveValue("9,5");
    fill("Taxa de juros anual", "10");
    next();

    await atStep(6);
    expect(rows("Parâmetros informados")[3]).toEqual(["Juros", "10,00% ao ano (efetiva)"]);
    const previews = bodies(requests, "POST", PREVIEW);
    expect(previews).toHaveLength(2);
    expect(previews[1]).toEqual(
      expect.objectContaining({ contract_rates: [expect.objectContaining({ rate: "0.1" })] }),
    );
  });

  it.each([
    ["Contrato", 1],
    ["Sistema", 2],
    ["Correção", 3],
    ["Juros", 4],
    ["Seguros e taxas", 5],
  ])("%s opens step %i", async (name, step) => {
    await atReview();

    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${name}`) }));

    await atStep(step);
  });

  it("keep Voltar one step back, not at the review", async () => {
    await atReview();
    fireEvent.click(screen.getByRole("button", { name: /^Correção/ }));
    await atStep(3);

    back();

    await atStep(2);
  });

  it("keep the owner on the step while what they changed there is not valid", async () => {
    const requests = await atReview();
    fireEvent.click(screen.getByRole("button", { name: /^Juros/ }));
    await atStep(4);
    fill("Taxa de juros anual", "");

    next();

    expect(screen.getByLabelText("Taxa de juros anual")).toHaveAccessibleDescription(
      "Informe a taxa de juros anual, como 9,5.",
    );
    await atStep(4);
    expect(bodies(requests, "POST", PREVIEW)).toHaveLength(1);
  });

  it("go on linearly once the owner has gone back to the welcome and started over", async () => {
    await atReview();
    fireEvent.click(screen.getByRole("button", { name: /^Contrato/ }));
    await atStep(1);
    back();
    fireEvent.click(await screen.findByRole("button", { name: "Configurar meu financiamento" }));
    await atStep(1);

    next();

    await atStep(2);
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
    expect(mip).not.toHaveAccessibleDescription();
    expect(dfi).toHaveAccessibleDescription("Preencha o valor de avaliação para calcular a taxa.");
    fill("MIP cobrado", "15,48");
    fill("DFI cobrado", "33,50");
    expect(screen.getByLabelText("MIP · Morte e invalidez")).toHaveValue("0,0258");
    expect(screen.getByLabelText("DFI · Danos ao imóvel")).toHaveValue("");

    fill("Valor de avaliação", "100.000,00");
    expect(screen.getByLabelText("DFI cobrado")).not.toHaveAccessibleDescription();
    expect(screen.getByLabelText("DFI · Danos ao imóvel")).toHaveValue("0,0335");

    for (let step = 5; step > 1; step--) {
      back();
      await atStep(step - 1);
    }
    fill("Valor financiado", "120.000,00");
    for (let step = 1; step < 5; step++) {
      next();
      await atStep(step + 1);
    }
    expect(screen.getByLabelText("MIP cobrado")).toHaveValue("15,48");
    expect(screen.getByLabelText("MIP · Morte e invalidez")).toHaveValue("0,0129");
    next();

    await screen.findByRole("heading", { name: "Tudo pronto." });
    expect(bodies(requests, "POST", PREVIEW)).toEqual([
      expect.objectContaining({
        mip_rates: [{ effective_from: "2024-01-10", rate: "0.000129" }],
        dfi_rates: [{ effective_from: "2024-01-10", rate: "0.000335" }],
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

  it("clears the missing rate's message once the charge gives it", async () => {
    stubMortgageApi();
    renderAt("/");
    await start();
    await continueTo(5, 1);
    fireEvent.click(
      screen.getByRole("button", { name: "Não sei a taxa. Usar o valor da primeira prestação" }),
    );
    next();
    expect(screen.getByLabelText("MIP · Morte e invalidez")).toHaveAttribute(
      "aria-invalid",
      "true",
    );

    fill("MIP cobrado", "15,48");

    expect(screen.getByLabelText("MIP · Morte e invalidez")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("DFI · Danos ao imóvel")).toHaveAttribute("aria-invalid", "true");
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
    addRateChange("10/04/2024", "8");
    await continueTo(5, 4);
    await review();
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));

    await atStep(4);
    expect(screen.getByRole("alert")).toHaveTextContent("Confira os campos destacados.");
    const change = screen.getByRole("region", { name: "Mudança 1" });
    expect(within(change).getByLabelText("A partir de")).toHaveAttribute("aria-invalid", "true");
    expect(within(change).getByLabelText("A partir de")).toHaveAccessibleDescription(
      "Valor inválido.",
    );
    expect(within(change).getByLabelText("Taxa")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Taxa de juros anual")).not.toHaveAttribute("aria-invalid");
    expect(within(change).getByLabelText("A partir de")).toHaveFocus();

    next();
    await atStep(5);
    expect(screen.getByLabelText("Taxa de administração")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Valor de avaliação")).not.toHaveAttribute("aria-invalid");
    expect(bodies(requests, "PUT", "/api/mortgage")).toHaveLength(1);
  });

  it("marks the MIP and DFI rates the API rejects on the insurance step", async () => {
    stubMortgageApi({
      onPreview: () => unprocessable("body.mip_rates[0].rate", "body.dfi_rates[0].rate"),
    });
    renderAt("/");

    await start();
    await continueTo(5, 1);
    answers[5]();
    next();

    expect(await screen.findByRole("alert")).toHaveTextContent("Confira os campos destacados.");
    await atStep(5);
    expect(screen.getByLabelText("MIP · Morte e invalidez")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("DFI · Danos ao imóvel")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Valor de avaliação")).not.toHaveAttribute("aria-invalid");
  });

  it("clears each rejection as soon as its field changes, and the alert with the last one", async () => {
    stubMortgageApi({
      onPreview: () => unprocessable("body.original_amount", "body.term_months"),
    });
    renderAt("/");
    await start();
    await continueTo(5, 1);
    answers[5]();
    next();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await atStep(1);
    expect(screen.getByLabelText("Valor financiado")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Prazo")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Valor financiado")).toHaveFocus();

    fill("Valor financiado", "70.000,00");
    expect(screen.getByLabelText("Valor financiado")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Prazo")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fill("Prazo", "12");
    expect(screen.getByLabelText("Prazo")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("drops the highlights once a rate change is added or removed, since they named rows", async () => {
    stubMortgageApi({ onPreview: () => unprocessable("body.contract_rates[1].rate") });
    renderAt("/");

    await start();
    await continueTo(4, 1);
    addRateChange("10/04/2024", "8");
    await continueTo(5, 4);
    answers[5]();
    next();

    await atStep(4);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
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
    answers[5]();
    next();
    if (step === 6) fireEvent.click(await screen.findByRole("button", { name: "Concluir" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    await atStep(step);
  });

  it("keeps saying the review failed when the owner edits a field, until they try again", async () => {
    stubMortgageApi({ onPreview: () => problem(500, "Internal Server Error", "boom") });
    renderAt("/");
    await start();
    await continueTo(5, 1);
    answers[5]();
    next();
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    fill("Taxa de administração", "25,90");

    expect(screen.getByRole("alert")).toBeInTheDocument();
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
    await review();

    const summary = screen.getByRole("region", { name: "Resumo" });
    expect(figures(summary)).toEqual([
      ["Quitação prevista", "fevereiro de 2024"],
      ["Prestação atual", "R$ 10.537,50"],
    ]);
  });
});
