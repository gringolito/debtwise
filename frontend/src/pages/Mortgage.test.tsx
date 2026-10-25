import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stubMortgageApi } from "@/test/mortgageApi";
import { registeredMortgage, schedule, scheduleAfterSave } from "@/test/mortgageFixtures";
import { renderAt } from "@/test/renderAt";
import { problem, stubRoutes } from "@/test/stubServer";

afterEach(() => {
  vi.unstubAllGlobals();
});

const notFound = () => problem(404, "Not Found", "no mortgage is registered");

describe("navigation", () => {
  it("links the header to the home page and to the mortgage", async () => {
    stubRoutes({
      "GET /api/health": () => Response.json({ status: "ok" }),
      "GET /api/mortgage": notFound,
    });
    renderAt("/");

    fireEvent.click(await screen.findByRole("link", { name: "Financiamento" }));

    expect(await screen.findByText("Nenhum financiamento cadastrado.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Início" }));
    expect(await screen.findByText("Servidor disponível")).toBeInTheDocument();
  });
});

describe("mortgage page without a mortgage", () => {
  it("offers to register one", async () => {
    stubRoutes({ "GET /api/mortgage": notFound });

    renderAt("/financiamento");

    expect(await screen.findByText("Nenhum financiamento cadastrado.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cadastrar financiamento" })).toHaveAttribute(
      "href",
      "/financiamento/editar",
    );
  });

  it("says it is loading until the server answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );

    renderAt("/financiamento");

    expect(await screen.findByText("Carregando financiamento…")).toBeInTheDocument();
  });

  it("says it could not load the mortgage when the server fails", async () => {
    stubRoutes({
      "GET /api/mortgage": () => problem(500, "Internal Server Error", "unexpected failure"),
    });

    renderAt("/financiamento");

    expect(
      await screen.findByText("Não foi possível carregar o financiamento."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Nenhum financiamento cadastrado.")).not.toBeInTheDocument();
  });
});

function text(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

function rowTexts(table: HTMLElement): string[][] {
  return within(table)
    .getAllByRole("row")
    .map((row) => Array.from(row.querySelectorAll("th, td")).map(text));
}

describe("mortgage page with a mortgage", () => {
  it("shows the contract terms in pt-BR", async () => {
    stubMortgageApi({ mortgage: registeredMortgage });

    renderAt("/financiamento");

    const terms = await screen.findByRole("region", { name: "Condições do contrato" });
    const entries = within(terms)
      .getAllByRole("term")
      .map((term) => [text(term), text(term.nextElementSibling as HTMLElement)]);
    expect(entries).toEqual([
      ["Data do contrato", "10/12/2023"],
      ["Valor financiado", "R$ 60.000,00"],
      ["Prazo", "6 meses"],
      ["Primeira prestação", "10/01/2024"],
      ["Sistema de amortização", "SAC"],
      ["Valor de avaliação", "R$ 100.000,00"],
    ]);
  });

  it("shows each rate and fee row with its effective date", async () => {
    stubMortgageApi({ mortgage: registeredMortgage });

    renderAt("/financiamento");

    const lists = async (name: string) =>
      within(await screen.findByRole("region", { name }))
        .getAllByRole("listitem")
        .map(text);
    expect(await lists("Taxa de juros")).toEqual([
      "A partir de 10/12/2023 Nominal: 12,00% a.a. (informada) Efetiva: 12,682503% a.a. (calculada)",
    ]);
    expect(await lists("MIP")).toEqual([
      "A partir de 10/12/2023 0,03% a.m.",
      "A partir de 01/04/2024 0,05% a.m.",
    ]);
    expect(await lists("DFI")).toEqual(["A partir de 10/12/2023 0,01% a.m."]);
    expect(await lists("Taxa de administração")).toEqual(["A partir de 10/12/2023 R$ 12,50"]);
  });

  it("marks the effective rate as the informed one when it was", async () => {
    stubMortgageApi({
      mortgage: {
        ...registeredMortgage,
        amortization_system: "price",
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

    renderAt("/financiamento");

    const rates = await screen.findByRole("region", { name: "Taxa de juros" });
    expect(within(rates).getAllByRole("listitem").map(text)).toEqual([
      "A partir de 10/12/2023 Nominal: 11,37% a.a. (calculada) Efetiva: 12,00% a.a. (informada)",
    ]);
    expect(screen.getByText("Price")).toBeInTheDocument();
  });

  it("does not round small monthly rates away", async () => {
    stubMortgageApi({
      mortgage: {
        ...registeredMortgage,
        mip_rates: [{ effective_from: "2023-12-10", rate: "0.00003456" }],
      },
    });

    renderAt("/financiamento");

    const mip = await screen.findByRole("region", { name: "MIP" });
    expect(within(mip).getAllByRole("listitem").map(text)).toEqual([
      "A partir de 10/12/2023 0,003456% a.m.",
    ]);
  });

  it("shows every installment of the schedule in pt-BR", async () => {
    stubMortgageApi({ mortgage: registeredMortgage });

    renderAt("/financiamento");

    const table = await screen.findByRole("table");
    expect(screen.getByText("Evolução do financiamento")).toBeInTheDocument();
    expect(rowTexts(table)).toEqual([
      [
        "Nº",
        "Vencimento",
        "Juros",
        "Amortização",
        "MIP",
        "DFI",
        "Taxa adm.",
        "Prestação",
        "Saldo devedor",
      ],
      [
        "1",
        "10/01/2024",
        "R$ 600,00",
        "R$ 10.000,00",
        "R$ 18,00",
        "R$ 10,00",
        "R$ 12,50",
        "R$ 10.640,50",
        "R$ 50.000,00",
      ],
      [
        "2",
        "10/02/2024",
        "R$ 500,00",
        "R$ 10.000,00",
        "R$ 15,00",
        "R$ 10,00",
        "R$ 12,50",
        "R$ 10.537,50",
        "R$ 40.000,00",
      ],
      [
        "3",
        "10/03/2024",
        "R$ 400,00",
        "R$ 10.000,00",
        "R$ 12,00",
        "R$ 10,00",
        "R$ 12,50",
        "R$ 10.434,50",
        "R$ 30.000,00",
      ],
      [
        "4",
        "10/04/2024",
        "R$ 300,00",
        "R$ 10.000,00",
        "R$ 15,00",
        "R$ 10,00",
        "R$ 12,50",
        "R$ 10.337,50",
        "R$ 20.000,00",
      ],
      [
        "5",
        "10/05/2024",
        "R$ 200,00",
        "R$ 10.000,00",
        "R$ 10,00",
        "R$ 10,00",
        "R$ 12,50",
        "R$ 10.232,50",
        "R$ 10.000,00",
      ],
      [
        "6",
        "10/06/2024",
        "R$ 100,00",
        "R$ 10.000,00",
        "R$ 5,00",
        "R$ 10,00",
        "R$ 12,50",
        "R$ 10.127,50",
        "R$ 0,00",
      ],
    ]);
  });

  it("says the schedule could not load while still showing the terms", async () => {
    stubRoutes({
      "GET /api/mortgage": () => Response.json(registeredMortgage),
      "GET /api/mortgage/schedule": () =>
        problem(500, "Internal Server Error", "unexpected failure"),
    });

    renderAt("/financiamento");

    expect(
      await screen.findByText("Não foi possível carregar a evolução do financiamento."),
    ).toBeInTheDocument();
    expect(screen.getByText("R$ 60.000,00")).toBeInTheDocument();
  });

  it("says the schedule is loading until the server answers", async () => {
    stubRoutes({
      "GET /api/mortgage": () => Response.json(registeredMortgage),
      "GET /api/mortgage/schedule": () => new Promise<Response>(() => {}),
    });

    renderAt("/financiamento");

    expect(await screen.findByText("Carregando evolução…")).toBeInTheDocument();
  });
});

describe("deleting the mortgage", () => {
  it("asks for confirmation, deletes and then shows the empty state", async () => {
    const requests = stubMortgageApi({ mortgage: registeredMortgage });
    renderAt("/financiamento");

    fireEvent.click(await screen.findByRole("button", { name: "Excluir" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Excluir financiamento?" });
    expect(requests.some((req) => req.method === "DELETE")).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));

    expect(await screen.findByText("Nenhum financiamento cadastrado.")).toBeInTheDocument();
    expect(requests.filter((req) => req.method === "DELETE")).toHaveLength(1);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("keeps the mortgage when the owner cancels", async () => {
    const requests = stubMortgageApi({ mortgage: registeredMortgage });
    renderAt("/financiamento");

    fireEvent.click(await screen.findByRole("button", { name: "Excluir" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(requests.some((req) => req.method === "DELETE")).toBe(false);
    expect(screen.getByText("R$ 60.000,00")).toBeInTheDocument();
  });

  it("says so when the server refuses to delete", async () => {
    stubRoutes({
      "GET /api/mortgage": () => Response.json(registeredMortgage),
      "GET /api/mortgage/schedule": () => Response.json(schedule),
      "DELETE /api/mortgage": () => problem(500, "Internal Server Error", "unexpected failure"),
    });
    renderAt("/financiamento");

    fireEvent.click(await screen.findByRole("button", { name: "Excluir" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));

    expect(
      await screen.findByText("Não foi possível excluir o financiamento."),
    ).toBeInTheDocument();
    expect(screen.getByText("R$ 60.000,00")).toBeInTheDocument();
  });
});

describe("a schedule that changed on the server", () => {
  const oldAmounts = ["R$ 10.640,50", "R$ 10.537,50", "R$ 10.127,50"];

  async function expectOnlyNewSchedule() {
    await screen.findByRole("region", { name: "Condições do contrato" });
    for (const amount of oldAmounts) {
      expect(screen.queryByText(amount)).not.toBeInTheDocument();
    }
    expect(await screen.findByText("R$ 60.745,00")).toBeInTheDocument();
    for (const amount of oldAmounts) {
      expect(screen.queryByText(amount)).not.toBeInTheDocument();
    }
  }

  it("never shows the old schedule after the mortgage is edited", async () => {
    stubMortgageApi({
      mortgage: registeredMortgage,
      onSave: () => registeredMortgage,
      scheduleAfterSave,
    });
    renderAt("/financiamento");
    expect(await screen.findByText("R$ 10.640,50")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Editar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Salvar" }));

    await expectOnlyNewSchedule();
  });

  it("never shows the old schedule after the mortgage is deleted and registered again", async () => {
    stubMortgageApi({
      mortgage: registeredMortgage,
      onSave: () => registeredMortgage,
      scheduleAfterSave,
    });
    renderAt("/financiamento");
    expect(await screen.findByText("R$ 10.640,50")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));
    fireEvent.click(await screen.findByRole("link", { name: "Cadastrar financiamento" }));
    fireEvent.click(await screen.findByRole("button", { name: "Salvar" }));

    await expectOnlyNewSchedule();
  });
});
