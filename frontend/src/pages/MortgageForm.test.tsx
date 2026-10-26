import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RegisteredMortgage } from "@/lib/api";
import { stubMortgageApi } from "@/test/mortgageApi";
import { registeredMortgage, trMortgage } from "@/test/mortgageFixtures";
import { renderAt } from "@/test/renderAt";
import { problem, stubRoutes } from "@/test/stubServer";

afterEach(() => {
  vi.unstubAllGlobals();
});

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function putBodies(requests: { method: string; body?: unknown }[]) {
  return requests.filter((req) => req.method === "PUT").map((req) => req.body);
}

function group(name: string) {
  return screen.getByRole("group", { name });
}

async function savedPage() {
  return screen.findByRole("region", { name: "Condições do contrato" });
}

describe("registering the mortgage", () => {
  it("sends the terms as the API reads them and shows the saved mortgage", async () => {
    const requests = stubMortgageApi({ onSave: () => registeredMortgage });
    renderAt("/financiamento");

    fireEvent.click(await screen.findByRole("link", { name: "Cadastrar financiamento" }));

    expect(
      await screen.findByRole("heading", { name: "Cadastrar financiamento" }),
    ).toBeInTheDocument();
    for (const name of [
      "Taxa de juros",
      "Taxa de juros 1",
      "MIP",
      "MIP 1",
      "DFI",
      "DFI 1",
      "Taxa de administração",
      "Taxa de administração 1",
    ]) {
      expect(group(name)).toBeInTheDocument();
    }
    expect(screen.queryByRole("group", { name: / 2$/ })).not.toBeInTheDocument();
    fill("Data do contrato", "2023-12-10");
    fill("Valor financiado", "60.000,00");
    fill("Prazo (meses)", "6");
    fill("Primeira prestação", "2024-01-10");
    fill("Sistema de amortização", "price");
    fill("Indexador", "tr");
    fill("Valor de avaliação", "100.000");
    fill("Vigência da taxa de juros 1", "2023-12-10");
    fill("Taxa de juros 1 (% a.a.)", "9,5");
    fill("Base da taxa de juros 1", "effective");
    fill("Vigência do MIP 1", "2023-12-10");
    fill("Taxa do MIP 1 (% a.m.)", "0,0258");
    fill("Vigência do DFI 1", "2023-12-10");
    fill("Taxa do DFI 1 (% a.m.)", "0,01");
    fill("Vigência da taxa de administração 1", "2023-12-10");
    fill("Valor da taxa de administração 1 (R$)", "25,90");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await savedPage()).toBeInTheDocument();
    expect(putBodies(requests)).toEqual([
      {
        contract_date: "2023-12-10",
        original_amount: "60000.00",
        term_months: 6,
        first_installment_date: "2024-01-10",
        amortization_system: "price",
        indexer: "tr",
        appraisal_value: "100000",
        contract_rates: [{ effective_from: "2023-12-10", rate: "0.095", basis: "effective" }],
        mip_rates: [{ effective_from: "2023-12-10", rate: "0.000258" }],
        dfi_rates: [{ effective_from: "2023-12-10", rate: "0.0001" }],
        fees: [{ effective_from: "2023-12-10", amount: "25.90" }],
      },
    ]);
    expect(screen.getByRole("heading", { name: "Financiamento" })).toBeInTheDocument();
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("sends text the API cannot read as typed so the API rejects it", async () => {
    const requests = stubMortgageApi({
      onSave: () => problem(422, "Unprocessable Entity", "validation failed"),
    });
    renderAt("/financiamento/editar");

    await screen.findByRole("heading", { name: "Cadastrar financiamento" });
    fill("Valor financiado", "muito");
    fill("Taxa de juros 1 (% a.a.)", "alta");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await screen.findByRole("alert");
    expect(putBodies(requests)).toEqual([
      {
        contract_date: "",
        original_amount: "muito",
        term_months: null,
        first_installment_date: "",
        amortization_system: "sac",
        indexer: "none",
        appraisal_value: "",
        contract_rates: [{ effective_from: "", rate: "alta", basis: "nominal" }],
        mip_rates: [{ effective_from: "", rate: "" }],
        dfi_rates: [{ effective_from: "", rate: "" }],
        fees: [{ effective_from: "", amount: "" }],
      },
    ]);
  });
});

describe("the indexer choice", () => {
  it("offers the indexers in pt-BR and starts on none for a new mortgage", async () => {
    stubMortgageApi();
    renderAt("/financiamento/editar");

    const select = await screen.findByLabelText("Indexador");
    expect(select).toHaveValue("none");
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => [option.getAttribute("value"), option.textContent]),
    ).toEqual([
      ["none", "Nenhum (prefixado)"],
      ["tr", "TR"],
      ["poupanca_yield", "Remuneração da poupança"],
      ["ipca", "IPCA"],
    ]);
  });
});

describe("the term in months", () => {
  it.each([
    ["6.5", 6.5],
    ["1e2", 100],
  ])("sends %s as the whole number it reads, not truncated", async (typed, sent) => {
    const requests = stubMortgageApi({
      mortgage: registeredMortgage,
      onSave: () => problem(422, "Unprocessable Entity", "validation failed"),
    });
    renderAt("/financiamento/editar");

    await screen.findByRole("heading", { name: "Editar financiamento" });
    fill("Prazo (meses)", typed);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await screen.findByRole("alert");
    expect(putBodies(requests)).toEqual([
      {
        contract_date: "2023-12-10",
        original_amount: "60000.00",
        term_months: sent,
        first_installment_date: "2024-01-10",
        amortization_system: "sac",
        indexer: "none",
        appraisal_value: "100000.00",
        contract_rates: [{ effective_from: "2023-12-10", rate: "0.12", basis: "nominal" }],
        mip_rates: [
          { effective_from: "2023-12-10", rate: "0.0003" },
          { effective_from: "2024-04-01", rate: "0.0005" },
        ],
        dfi_rates: [{ effective_from: "2023-12-10", rate: "0.0001" }],
        fees: [{ effective_from: "2023-12-10", amount: "12.50" }],
      },
    ]);
  });
});

describe("editing the mortgage", () => {
  it("prefills the form with the registered mortgage and sends the edited one", async () => {
    const edited: RegisteredMortgage = { ...registeredMortgage, original_amount: "250000.00" };
    const requests = stubMortgageApi({ mortgage: registeredMortgage, onSave: () => edited });
    renderAt("/financiamento");

    fireEvent.click(await screen.findByRole("link", { name: "Editar" }));

    expect(
      await screen.findByRole("heading", { name: "Editar financiamento" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Data do contrato")).toHaveValue("2023-12-10");
    expect(screen.getByLabelText("Valor financiado")).toHaveValue("60000,00");
    expect(screen.getByLabelText("Prazo (meses)")).toHaveValue(6);
    expect(screen.getByLabelText("Primeira prestação")).toHaveValue("2024-01-10");
    expect(screen.getByLabelText("Sistema de amortização")).toHaveValue("sac");
    expect(screen.getByLabelText("Valor de avaliação")).toHaveValue("100000,00");
    expect(screen.getByLabelText("Vigência da taxa de juros 1")).toHaveValue("2023-12-10");
    expect(screen.getByLabelText("Taxa de juros 1 (% a.a.)")).toHaveValue("12");
    expect(screen.getByLabelText("Base da taxa de juros 1")).toHaveValue("nominal");
    expect(screen.getByLabelText("Vigência do MIP 1")).toHaveValue("2023-12-10");
    expect(screen.getByLabelText("Taxa do MIP 1 (% a.m.)")).toHaveValue("0,03");
    expect(screen.getByLabelText("Vigência do MIP 2")).toHaveValue("2024-04-01");
    expect(screen.getByLabelText("Taxa do MIP 2 (% a.m.)")).toHaveValue("0,05");
    expect(screen.getByLabelText("Taxa do DFI 1 (% a.m.)")).toHaveValue("0,01");
    expect(screen.getByLabelText("Valor da taxa de administração 1 (R$)")).toHaveValue("12,50");

    fill("Valor financiado", "250.000,00");
    fill("Taxa do MIP 2 (% a.m.)", "0,06");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    const page = await savedPage();
    expect(within(page).getByText("R$ 250.000,00")).toBeInTheDocument();
    expect(putBodies(requests)).toEqual([
      {
        contract_date: "2023-12-10",
        original_amount: "250000.00",
        term_months: 6,
        first_installment_date: "2024-01-10",
        amortization_system: "sac",
        indexer: "none",
        appraisal_value: "100000.00",
        contract_rates: [{ effective_from: "2023-12-10", rate: "0.12", basis: "nominal" }],
        mip_rates: [
          { effective_from: "2023-12-10", rate: "0.0003" },
          { effective_from: "2024-04-01", rate: "0.0006" },
        ],
        dfi_rates: [{ effective_from: "2023-12-10", rate: "0.0001" }],
        fees: [{ effective_from: "2023-12-10", amount: "12.50" }],
      },
    ]);
  });

  it("prefills the saved indexer and sends the one the owner changes it to", async () => {
    const edited: RegisteredMortgage = { ...trMortgage, indexer: "ipca" };
    const requests = stubMortgageApi({ mortgage: trMortgage, onSave: () => edited });
    renderAt("/financiamento/editar");

    expect(await screen.findByLabelText("Indexador")).toHaveValue("tr");
    fill("Indexador", "ipca");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await savedPage();
    expect(putBodies(requests)).toEqual([expect.objectContaining({ indexer: "ipca" })]);
  });

  it("prefills the rate the owner informed when it was the effective one", async () => {
    stubMortgageApi({
      mortgage: {
        ...registeredMortgage,
        contract_rates: [
          {
            effective_from: "2023-12-10",
            basis: "effective",
            nominal: "0.1137",
            effective: "0.12",
          },
        ],
      },
    });
    renderAt("/financiamento/editar");

    expect(await screen.findByLabelText("Taxa de juros 1 (% a.a.)")).toHaveValue("12");
    expect(screen.getByLabelText("Base da taxa de juros 1")).toHaveValue("effective");
  });

  it("prefills a rate with more than two decimal digits in full", async () => {
    stubMortgageApi({
      mortgage: {
        ...registeredMortgage,
        mip_rates: [{ effective_from: "2023-12-10", rate: "0.000258" }],
      },
    });
    renderAt("/financiamento/editar");

    expect(await screen.findByLabelText("Taxa do MIP 1 (% a.m.)")).toHaveValue("0,0258");
  });

  it("returns to the mortgage without saving when the owner cancels", async () => {
    const requests = stubMortgageApi({ mortgage: registeredMortgage });
    renderAt("/financiamento/editar");

    await screen.findByRole("heading", { name: "Editar financiamento" });
    fill("Valor financiado", "1,00");
    fireEvent.click(screen.getByRole("link", { name: "Cancelar" }));

    const page = await savedPage();
    expect(within(page).getByText("R$ 60.000,00")).toBeInTheDocument();
    expect(putBodies(requests)).toEqual([]);
  });
});

describe("rows of the lists", () => {
  it("adds and removes rows, keeping what was typed in the others", async () => {
    const requests = stubMortgageApi({
      mortgage: registeredMortgage,
      onSave: () => registeredMortgage,
    });
    renderAt("/financiamento/editar");
    await screen.findByRole("heading", { name: "Editar financiamento" });

    fireEvent.click(within(group("MIP 1")).getByRole("button", { name: "Remover" }));
    expect(screen.queryByRole("group", { name: "MIP 2" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Vigência do MIP 1")).toHaveValue("2024-04-01");
    expect(screen.getByLabelText("Taxa do MIP 1 (% a.m.)")).toHaveValue("0,05");

    fireEvent.click(within(group("DFI 1")).getByRole("button", { name: "Remover" }));
    expect(screen.queryByRole("group", { name: "DFI 1" })).not.toBeInTheDocument();

    fireEvent.click(within(group("Taxa de juros")).getByRole("button", { name: "Adicionar" }));
    fill("Vigência da taxa de juros 2", "2025-01-10");
    fill("Taxa de juros 2 (% a.a.)", "10");
    fireEvent.click(
      within(group("Taxa de administração")).getByRole("button", { name: "Adicionar" }),
    );
    fill("Vigência da taxa de administração 2", "2025-01-10");
    fill("Valor da taxa de administração 2 (R$)", "12,5");
    fireEvent.click(within(group("MIP")).getByRole("button", { name: "Adicionar" }));
    expect(screen.getByLabelText("Taxa do MIP 2 (% a.m.)")).toHaveValue("");
    fireEvent.click(within(group("DFI")).getByRole("button", { name: "Adicionar" }));
    fill("Vigência do DFI 1", "2024-02-01");
    fill("Taxa do DFI 1 (% a.m.)", "0,02");
    fireEvent.click(within(group("MIP 2")).getByRole("button", { name: "Remover" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await savedPage();
    expect(putBodies(requests)).toEqual([
      {
        contract_date: "2023-12-10",
        original_amount: "60000.00",
        term_months: 6,
        first_installment_date: "2024-01-10",
        amortization_system: "sac",
        indexer: "none",
        appraisal_value: "100000.00",
        contract_rates: [
          { effective_from: "2023-12-10", rate: "0.12", basis: "nominal" },
          { effective_from: "2025-01-10", rate: "0.1", basis: "nominal" },
        ],
        mip_rates: [{ effective_from: "2024-04-01", rate: "0.0005" }],
        dfi_rates: [{ effective_from: "2024-02-01", rate: "0.0002" }],
        fees: [
          { effective_from: "2023-12-10", amount: "12.50" },
          { effective_from: "2025-01-10", amount: "12.5" },
        ],
      },
    ]);
  });
});

describe("a rejected mortgage", () => {
  const rejection = () =>
    problem(422, "Unprocessable Entity", "validation failed", [
      { location: "body.original_amount", message: "must be a decimal number" },
      { location: "body.first_installment_date", message: "must not be before the contract date" },
      { location: "body.contract_rates", message: "must have a row on the contract date" },
      { location: "body.mip_rates[1].rate", message: "must not be negative" },
      { location: "body.dfi_rates", message: "must have a row on the contract date" },
      { location: "body.contract_rates[0].basis", message: "must be nominal or effective" },
      { location: "body.fees[1].effective_from", message: "repeats the date of another row" },
      { location: "body.something_else", message: "is not known" },
    ]);

  async function submitRejected() {
    stubMortgageApi({ mortgage: registeredMortgage, onSave: rejection });
    renderAt("/financiamento/editar");
    await screen.findByRole("heading", { name: "Editar financiamento" });
    fill("Valor financiado", "abc");
    fireEvent.click(
      within(group("Taxa de administração")).getByRole("button", { name: "Adicionar" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    return screen.findByRole("alert");
  }

  it("marks the fields and lists the API named, in Portuguese, and keeps the input", async () => {
    const alert = await submitRejected();

    expect(alert).toHaveTextContent("Não foi possível salvar. Verifique os campos destacados.");
    expect(screen.getByLabelText("Valor financiado")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Primeira prestação")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Taxa do MIP 2 (% a.m.)")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Vigência da taxa de administração 2")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Base da taxa de juros 1")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(group("DFI")).toHaveAttribute("aria-invalid", "true");
    expect(group("Taxa de juros")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText("Valor inválido.")).toHaveLength(5);
    expect(screen.getAllByText("Confira as linhas desta lista.")).toHaveLength(2);

    expect(screen.getByLabelText("Data do contrato")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Taxa do MIP 1 (% a.m.)")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Vigência da taxa de administração 1")).not.toHaveAttribute(
      "aria-invalid",
    );
    expect(screen.getByLabelText("Valor da taxa de administração 2 (R$)")).not.toHaveAttribute(
      "aria-invalid",
    );
    expect(group("MIP")).not.toHaveAttribute("aria-invalid");

    expect(screen.queryByText(/must|repeats|known/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Valor financiado")).toHaveValue("abc");
    expect(screen.getByLabelText("Vigência da taxa de administração 2")).toHaveValue("");
  });

  it("drops the highlights once rows move, since they pointed at row numbers", async () => {
    await submitRejected();

    fireEvent.click(within(group("MIP 1")).getByRole("button", { name: "Remover" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Valor inválido.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Valor financiado")).not.toHaveAttribute("aria-invalid");
  });

  it("says plainly that saving failed when the server breaks", async () => {
    stubMortgageApi({
      mortgage: registeredMortgage,
      onSave: () => problem(500, "Internal Server Error", "unexpected failure"),
    });
    renderAt("/financiamento/editar");

    fireEvent.click(await screen.findByRole("button", { name: "Salvar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível salvar o financiamento.",
    );
    expect(screen.queryByText("Valor inválido.")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled());
  });
});

describe("loading the form", () => {
  it("says it could not load the mortgage when the server fails", async () => {
    stubRoutes({
      "GET /api/mortgage": () => problem(500, "Internal Server Error", "unexpected failure"),
    });

    renderAt("/financiamento/editar");

    expect(
      await screen.findByText("Não foi possível carregar o financiamento."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();
  });

  it("says it is loading until the server answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );

    renderAt("/financiamento/editar");

    expect(await screen.findByText("Carregando financiamento…")).toBeInTheDocument();
  });
});

describe("money typed with several thousands groups", () => {
  it.each([
    ["1.250.000,00", "1250000.00"],
    ["1.250.000", "1250000"],
  ])("sends %s as %s", async (typed, sent) => {
    const requests = stubMortgageApi({
      mortgage: registeredMortgage,
      onSave: () => problem(422, "Unprocessable Entity", "validation failed"),
    });
    renderAt("/financiamento/editar");

    await screen.findByRole("heading", { name: "Editar financiamento" });
    fill("Valor financiado", typed);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await screen.findByRole("alert");
    expect(putBodies(requests)).toHaveLength(1);
    expect(putBodies(requests)[0]).toMatchObject({ original_amount: sent });
  });
});

describe("rates saved with fewer than two fraction digits", () => {
  it("prefills them as the whole percent they are", async () => {
    stubMortgageApi({
      mortgage: {
        ...registeredMortgage,
        contract_rates: [
          {
            effective_from: "2023-12-10",
            basis: "nominal",
            nominal: "0.1",
            effective: "0.104713",
          },
        ],
        mip_rates: [
          { effective_from: "2023-12-10", rate: "0.5" },
          { effective_from: "2024-04-01", rate: "0.05" },
        ],
        dfi_rates: [{ effective_from: "2023-12-10", rate: "1" }],
      },
    });
    renderAt("/financiamento/editar");

    expect(await screen.findByLabelText("Taxa de juros 1 (% a.a.)")).toHaveValue("10");
    expect(screen.getByLabelText("Taxa do MIP 1 (% a.m.)")).toHaveValue("50");
    expect(screen.getByLabelText("Taxa do MIP 2 (% a.m.)")).toHaveValue("5");
    expect(screen.getByLabelText("Taxa do DFI 1 (% a.m.)")).toHaveValue("100");
  });
});

describe("each location the API can reject", () => {
  const twoRowsEach: RegisteredMortgage = {
    ...registeredMortgage,
    contract_rates: [
      { effective_from: "2023-12-10", basis: "nominal", nominal: "0.12", effective: "0.1268" },
      { effective_from: "2024-06-10", basis: "nominal", nominal: "0.11", effective: "0.1157" },
    ],
    mip_rates: [
      { effective_from: "2023-12-10", rate: "0.0003" },
      { effective_from: "2024-04-01", rate: "0.0005" },
    ],
    dfi_rates: [
      { effective_from: "2023-12-10", rate: "0.0001" },
      { effective_from: "2024-04-01", rate: "0.0002" },
    ],
    fees: [
      { effective_from: "2023-12-10", amount: "12.50" },
      { effective_from: "2024-04-01", amount: "15.00" },
    ],
  };

  const inputs = [
    ["body.contract_date", "Data do contrato"],
    ["body.original_amount", "Valor financiado"],
    ["body.term_months", "Prazo (meses)"],
    ["body.first_installment_date", "Primeira prestação"],
    ["body.amortization_system", "Sistema de amortização"],
    ["body.indexer", "Indexador"],
    ["body.appraisal_value", "Valor de avaliação"],
    ["body.contract_rates[1].effective_from", "Vigência da taxa de juros 2"],
    ["body.contract_rates[1].rate", "Taxa de juros 2 (% a.a.)"],
    ["body.contract_rates[1].basis", "Base da taxa de juros 2"],
    ["body.mip_rates[1].effective_from", "Vigência do MIP 2"],
    ["body.mip_rates[1].rate", "Taxa do MIP 2 (% a.m.)"],
    ["body.dfi_rates[1].effective_from", "Vigência do DFI 2"],
    ["body.dfi_rates[1].rate", "Taxa do DFI 2 (% a.m.)"],
    ["body.fees[1].effective_from", "Vigência da taxa de administração 2"],
    ["body.fees[1].amount", "Valor da taxa de administração 2 (R$)"],
  ] as const;

  const lists = [
    ["body.contract_rates", "Taxa de juros"],
    ["body.mip_rates", "MIP"],
    ["body.dfi_rates", "DFI"],
    ["body.fees", "Taxa de administração"],
  ] as const;

  async function rejectAt(location: string) {
    stubMortgageApi({
      mortgage: twoRowsEach,
      onSave: () =>
        problem(422, "Unprocessable Entity", "validation failed", [
          { location, message: "is not acceptable" },
        ]),
    });
    renderAt("/financiamento/editar");
    await screen.findByRole("heading", { name: "Editar financiamento" });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findByRole("alert");
  }

  it.each(inputs)("marks only the input of %s", async (location, label) => {
    await rejectAt(location);

    expect(screen.getByLabelText(label)).toHaveAttribute("aria-invalid", "true");
    for (const [, other] of inputs.filter(([, name]) => name !== label)) {
      expect(screen.getByLabelText(other)).not.toHaveAttribute("aria-invalid");
    }
    for (const [, list] of lists) {
      expect(group(list)).not.toHaveAttribute("aria-invalid");
    }
    expect(screen.getAllByText("Valor inválido.")).toHaveLength(1);
  });

  it.each(lists)("marks only the list of %s", async (location, title) => {
    await rejectAt(location);

    expect(group(title)).toHaveAttribute("aria-invalid", "true");
    for (const [, other] of lists.filter(([, name]) => name !== title)) {
      expect(group(other)).not.toHaveAttribute("aria-invalid");
    }
    for (const [, label] of inputs) {
      expect(screen.getByLabelText(label)).not.toHaveAttribute("aria-invalid");
    }
    expect(screen.getAllByText("Confira as linhas desta lista.")).toHaveLength(1);
  });
});

describe("removing a middle row", () => {
  const threeRowsEach: RegisteredMortgage = {
    ...registeredMortgage,
    contract_rates: [
      { effective_from: "2023-12-10", basis: "nominal", nominal: "0.12", effective: "0.1268" },
      { effective_from: "2024-06-10", basis: "effective", nominal: "0.0957", effective: "0.1" },
      { effective_from: "2025-01-10", basis: "nominal", nominal: "0.09", effective: "0.0938" },
    ],
    fees: [
      { effective_from: "2023-12-10", amount: "12.50" },
      { effective_from: "2024-06-10", amount: "15.00" },
      { effective_from: "2025-01-10", amount: "20.00" },
    ],
  };

  it("sends the remaining contract rates and fees in order", async () => {
    const requests = stubMortgageApi({
      mortgage: threeRowsEach,
      onSave: () => registeredMortgage,
    });
    renderAt("/financiamento/editar");
    await screen.findByRole("heading", { name: "Editar financiamento" });

    fireEvent.click(within(group("Taxa de juros 2")).getByRole("button", { name: "Remover" }));
    fireEvent.click(
      within(group("Taxa de administração 2")).getByRole("button", { name: "Remover" }),
    );

    expect(screen.queryByRole("group", { name: "Taxa de juros 3" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Taxa de administração 3" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Taxa de juros 2 (% a.a.)")).toHaveValue("9");
    expect(screen.getByLabelText("Valor da taxa de administração 2 (R$)")).toHaveValue("20,00");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await savedPage();
    expect(putBodies(requests)).toHaveLength(1);
    expect(putBodies(requests)[0]).toMatchObject({
      contract_rates: [
        { effective_from: "2023-12-10", rate: "0.12", basis: "nominal" },
        { effective_from: "2025-01-10", rate: "0.09", basis: "nominal" },
      ],
      fees: [
        { effective_from: "2023-12-10", amount: "12.50" },
        { effective_from: "2025-01-10", amount: "20.00" },
      ],
    });
  });
});
