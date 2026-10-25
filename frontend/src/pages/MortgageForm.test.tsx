import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RegisteredMortgage } from "@/lib/api";
import { stubMortgageApi } from "@/test/mortgageApi";
import { registeredMortgage } from "@/test/mortgageFixtures";
import { renderAt } from "@/test/renderApp";
import { problem, routes, stubServer } from "@/test/stubServer";

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
      "Tarifa de administração",
      "Tarifa de administração 1",
    ]) {
      expect(group(name)).toBeInTheDocument();
    }
    expect(screen.queryByRole("group", { name: / 2$/ })).not.toBeInTheDocument();
    fill("Data do contrato", "2023-12-10");
    fill("Valor financiado", "60.000,00");
    fill("Prazo (meses)", "6");
    fill("Primeira prestação", "2024-01-10");
    fill("Sistema de amortização", "price");
    fill("Valor de avaliação", "100000,00");
    fill("Vigência da taxa de juros 1", "2023-12-10");
    fill("Taxa de juros 1 (% a.a.)", "9,5");
    fill("Base da taxa de juros 1", "effective");
    fill("Vigência do MIP 1", "2023-12-10");
    fill("Taxa do MIP 1 (% a.m.)", "0,0258");
    fill("Vigência do DFI 1", "2023-12-10");
    fill("Taxa do DFI 1 (% a.m.)", "0,01");
    fill("Vigência da tarifa 1", "2023-12-10");
    fill("Valor da tarifa 1 (R$)", "25,90");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await savedPage()).toBeInTheDocument();
    expect(putBodies(requests)).toEqual([
      {
        contract_date: "2023-12-10",
        original_amount: "60000.00",
        term_months: 6,
        first_installment_date: "2024-01-10",
        amortization_system: "price",
        appraisal_value: "100000.00",
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
        appraisal_value: "",
        contract_rates: [{ effective_from: "", rate: "alta", basis: "nominal" }],
        mip_rates: [{ effective_from: "", rate: "" }],
        dfi_rates: [{ effective_from: "", rate: "" }],
        fees: [{ effective_from: "", amount: "" }],
      },
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
        appraisal_value: "100000.00",
        contract_rates: [{ effective_from: "2023-12-10", rate: "0.12", basis: "nominal" }],
        mip_rates: [
          { effective_from: "2023-12-10", rate: "0.0003" },
          { effective_from: "2024-04-01", rate: "0.0005" },
        ],
        dfi_rates: [{ effective_from: "2023-12-10", rate: "0.0001" }],
        fees: [{ effective_from: "2023-12-10", amount: "10.00" }],
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
    expect(screen.getByLabelText("Valor da tarifa 1 (R$)")).toHaveValue("10,00");

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
        appraisal_value: "100000.00",
        contract_rates: [{ effective_from: "2023-12-10", rate: "0.12", basis: "nominal" }],
        mip_rates: [
          { effective_from: "2023-12-10", rate: "0.0003" },
          { effective_from: "2024-04-01", rate: "0.0006" },
        ],
        dfi_rates: [{ effective_from: "2023-12-10", rate: "0.0001" }],
        fees: [{ effective_from: "2023-12-10", amount: "10.00" }],
      },
    ]);
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
      within(group("Tarifa de administração")).getByRole("button", { name: "Adicionar" }),
    );
    fill("Vigência da tarifa 2", "2025-01-10");
    fill("Valor da tarifa 2 (R$)", "12,5");
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
        appraisal_value: "100000.00",
        contract_rates: [
          { effective_from: "2023-12-10", rate: "0.12", basis: "nominal" },
          { effective_from: "2025-01-10", rate: "0.1", basis: "nominal" },
        ],
        mip_rates: [{ effective_from: "2024-04-01", rate: "0.0005" }],
        dfi_rates: [{ effective_from: "2024-02-01", rate: "0.0002" }],
        fees: [
          { effective_from: "2023-12-10", amount: "10.00" },
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
      { location: "body.fees[1].effective_from", message: "repeats the date of another row" },
      { location: "body.something_else", message: "is not known" },
    ]);

  async function submitRejected() {
    stubMortgageApi({ mortgage: registeredMortgage, onSave: rejection });
    renderAt("/financiamento/editar");
    await screen.findByRole("heading", { name: "Editar financiamento" });
    fill("Valor financiado", "abc");
    fireEvent.click(
      within(group("Tarifa de administração")).getByRole("button", { name: "Adicionar" }),
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
    expect(screen.getByLabelText("Vigência da tarifa 2")).toHaveAttribute("aria-invalid", "true");
    expect(group("Taxa de juros")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText("Valor inválido.")).toHaveLength(4);
    expect(screen.getAllByText("Confira as linhas desta lista.")).toHaveLength(1);

    expect(screen.getByLabelText("Data do contrato")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Taxa do MIP 1 (% a.m.)")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Vigência da tarifa 1")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Valor da tarifa 2 (R$)")).not.toHaveAttribute("aria-invalid");
    expect(group("MIP")).not.toHaveAttribute("aria-invalid");

    expect(screen.queryByText(/must|repeats|known/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Valor financiado")).toHaveValue("abc");
    expect(screen.getByLabelText("Vigência da tarifa 2")).toHaveValue("");
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
    stubServer(
      routes({
        "GET /api/mortgage": () => problem(500, "Internal Server Error", "unexpected failure"),
      }),
    );

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
