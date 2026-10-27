import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CorrectionIndex } from "@/lib/api";
import { rowTexts, text } from "@/test/dom";
import { stubMortgageApi } from "@/test/mortgageApi";
import {
  deferredSchedule,
  ipcaMortgage,
  ipcaSchedule,
  prepayments,
  projectedSchedule,
  registeredMortgage,
  schedule,
  scheduleAfterSave,
  statements,
  trMortgage,
  trSchedule,
} from "@/test/mortgageFixtures";
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
      ["Indexador", "Nenhum (prefixado)"],
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

    const table = await screen.findByRole("table", { name: "Evolução do financiamento" });
    expect(screen.getByText("Evolução do financiamento")).toBeInTheDocument();
    expect(rowTexts(table)).toEqual([
      [
        "Nº",
        "Vencimento",
        "Índice",
        "Correção",
        "Juros",
        "Amortização",
        "MIP",
        "DFI",
        "Taxa adm.",
        "Prestação",
        "Amortização extraordinária",
        "Saldo devedor",
      ],
      [
        "1",
        "10/01/2024",
        "—",
        "R$ 0,00",
        "R$ 600,00",
        "R$ 10.000,00",
        "R$ 18,00",
        "R$ 10,00",
        "R$ 12,50",
        "R$ 10.640,50",
        "R$ 0,00",
        "R$ 50.000,00",
      ],
      [
        "2",
        "10/02/2024",
        "—",
        "R$ 0,00",
        "R$ 500,00",
        "R$ 10.000,00",
        "R$ 15,00",
        "R$ 10,00",
        "R$ 12,50",
        "R$ 10.537,50",
        "R$ 0,00",
        "R$ 40.000,00",
      ],
      [
        "3",
        "10/03/2024",
        "—",
        "R$ 0,00",
        "R$ 400,00",
        "R$ 10.000,00",
        "R$ 12,00",
        "R$ 10,00",
        "R$ 12,50",
        "R$ 10.434,50",
        "R$ 0,00",
        "R$ 30.000,00",
      ],
      [
        "4",
        "10/04/2024",
        "—",
        "R$ 0,00",
        "R$ 300,00",
        "R$ 10.000,00",
        "R$ 15,00",
        "R$ 10,00",
        "R$ 12,50",
        "R$ 10.337,50",
        "R$ 0,00",
        "R$ 20.000,00",
      ],
      [
        "5",
        "10/05/2024",
        "—",
        "R$ 0,00",
        "R$ 200,00",
        "R$ 10.000,00",
        "R$ 10,00",
        "R$ 10,00",
        "R$ 12,50",
        "R$ 10.232,50",
        "R$ 0,00",
        "R$ 10.000,00",
      ],
      [
        "6",
        "10/06/2024",
        "—",
        "R$ 0,00",
        "R$ 100,00",
        "R$ 10.000,00",
        "R$ 5,00",
        "R$ 10,00",
        "R$ 12,50",
        "R$ 10.127,50",
        "R$ 0,00",
        "R$ 0,00",
      ],
    ]);
  });

  it("shows the indexer of the mortgage among its terms", async () => {
    stubMortgageApi({ mortgage: trMortgage });

    renderAt("/financiamento");

    const terms = await screen.findByRole("region", { name: "Condições do contrato" });
    const entries = within(terms)
      .getAllByRole("term")
      .map((term) => [text(term), text(term.nextElementSibling as HTMLElement)]);
    expect(entries).toContainEqual(["Indexador", "TR"]);
  });

  it("shows no warning above the schedule of a mortgage without an indexer", async () => {
    stubMortgageApi({ mortgage: registeredMortgage });

    renderAt("/financiamento");

    await screen.findByRole("table", { name: "Evolução do financiamento" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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

describe("the schedule of an indexed mortgage", () => {
  const header = [
    "Nº",
    "Vencimento",
    "Índice",
    "Correção",
    "Juros",
    "Amortização",
    "MIP",
    "DFI",
    "Taxa adm.",
    "Prestação",
    "Amortização extraordinária",
    "Saldo devedor",
  ];

  it("shows each correction with the index value and period behind it", async () => {
    stubMortgageApi({ mortgage: trMortgage, schedule: trSchedule });

    renderAt("/financiamento");

    const table = await screen.findByRole("table", { name: "Evolução do financiamento" });
    expect(rowTexts(table)).toEqual([
      header,
      [
        "1",
        "10/01/2024",
        "TR 0,0539% 10/12/2023 a 10/01/2024",
        "R$ 32,34",
        "R$ 603,23",
        "R$ 10.000,00",
        "R$ 18,00",
        "R$ 10,00",
        "R$ 12,50",
        "R$ 10.643,73",
        "R$ 0,00",
        "R$ 50.032,34",
      ],
      [
        "2",
        "10/02/2024",
        "TR Sem índice 10/01/2024 a 10/02/2024",
        "R$ 0,00",
        "R$ 500,00",
        "R$ 10.000,00",
        "R$ 15,00",
        "R$ 10,00",
        "R$ 12,50",
        "R$ 10.537,50",
        "R$ 0,00",
        "R$ 40.032,34",
      ],
      [
        "3",
        "10/03/2024",
        "—",
        "R$ 0,00",
        "R$ 400,00",
        "R$ 10.000,00",
        "R$ 12,00",
        "R$ 10,00",
        "R$ 12,50",
        "R$ 10.434,50",
        "R$ 0,00",
        "R$ 30.032,34",
      ],
    ]);
  });

  it("shows an IPCA value with the month it is for", async () => {
    stubMortgageApi({ mortgage: ipcaMortgage, schedule: ipcaSchedule });

    renderAt("/financiamento");

    const table = await screen.findByRole("table", { name: "Evolução do financiamento" });
    expect(rowTexts(table).slice(1)).toEqual([
      [
        "1",
        "10/01/2024",
        "IPCA 0,56% dez/2023",
        "R$ 336,00",
        "R$ 603,23",
        "R$ 10.000,00",
        "R$ 18,00",
        "R$ 10,00",
        "R$ 12,50",
        "R$ 10.643,73",
        "R$ 0,00",
        "R$ 50.336,00",
      ],
    ]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("warns above the schedule how many months have no index value", async () => {
    stubMortgageApi({ mortgage: trMortgage, schedule: trSchedule });

    renderAt("/financiamento");

    const alert = await screen.findByRole("alert");
    expect(text(alert)).toBe(
      "Faltam valores de TR para 1 mês. Esse mês não foi corrigido. Atualize os dados de mercado na página Índices.",
    );
    expect(within(alert).getByRole("link", { name: "Índices" })).toHaveAttribute(
      "href",
      "/indices",
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(
      alert.compareDocumentPosition(
        screen.getByRole("table", { name: "Evolução do financiamento" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("counts every month without an index value", async () => {
    const missing = (start: string, end: string): CorrectionIndex => ({
      index: "poupanca_yield",
      status: "missing",
      period_start: start,
      period_end: end,
      methods: [],
    });
    const [first, second, third] = trSchedule.installments;
    stubMortgageApi({
      mortgage: { ...trMortgage, indexer: "poupanca_yield" },
      schedule: {
        installments: [
          { ...first, index_values: [missing("2023-12-10", "2024-01-10")] },
          { ...second, index_values: [missing("2024-01-10", "2024-02-10")] },
          third,
        ],
      },
    });

    renderAt("/financiamento");

    expect(text(await screen.findByRole("alert"))).toBe(
      "Faltam valores de Remuneração da poupança para 2 meses. Esses meses não foram corrigidos. Atualize os dados de mercado na página Índices.",
    );
  });

  it("lists each index value of an installment on its own line and counts the missing ones", async () => {
    stubMortgageApi({ mortgage: trMortgage, schedule: deferredSchedule });

    renderAt("/financiamento");

    const table = await screen.findByRole("table", { name: "Evolução do financiamento" });
    expect(rowTexts(table).slice(1)).toEqual([
      [
        "1",
        "10/03/2024",
        "TR Sem índice 10/12/2023 a 10/01/2024 TR Sem índice 10/01/2024 a 10/02/2024 TR 0,2166% 10/02/2024 a 10/03/2024",
        "R$ 108,30",
        "R$ 603,23",
        "R$ 10.000,00",
        "R$ 18,00",
        "R$ 10,00",
        "R$ 12,50",
        "R$ 10.643,73",
        "R$ 0,00",
        "R$ 50.108,30",
      ],
    ]);
    expect(text(await screen.findByRole("alert"))).toBe(
      "Faltam valores de TR para 2 meses. Esses meses não foram corrigidos. Atualize os dados de mercado na página Índices.",
    );
  });

  it("marks a projected value and names the projection methods behind it", async () => {
    stubMortgageApi({
      mortgage: { ...trMortgage, indexer: "poupanca_yield" },
      schedule: projectedSchedule,
    });

    renderAt("/financiamento");

    const table = await screen.findByRole("table", { name: "Evolução do financiamento" });
    expect(rowTexts(table).slice(1)).toEqual([
      [
        "3",
        "10/03/2024",
        "Remuneração da poupança 0,6293% Projetado 10/02/2024 a 10/03/2024 TR: Média dos últimos 12 meses; Selic meta: Mediana do Focus (BCB)",
        "R$ 188,99",
        "R$ 400,00",
        "R$ 10.000,00",
        "R$ 12,00",
        "R$ 10,00",
        "R$ 12,50",
        "R$ 10.434,50",
        "R$ 0,00",
        "R$ 30.032,34",
      ],
    ]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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

describe("prepayments and statements of a mortgage deleted and registered again", () => {
  it("never shows the rows recorded on the old mortgage", async () => {
    stubMortgageApi({
      mortgage: registeredMortgage,
      prepayments,
      statements,
      onSave: () => registeredMortgage,
    });
    renderAt("/financiamento");
    expect(await screen.findByText("R$ 12.500,50")).toBeInTheDocument();
    expect(await screen.findByText("R$ 41.000,00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));
    fireEvent.click(await screen.findByRole("link", { name: "Cadastrar financiamento" }));
    fireEvent.click(await screen.findByRole("button", { name: "Salvar" }));

    await screen.findByRole("region", { name: "Condições do contrato" });
    expect(screen.queryByText("R$ 12.500,50")).not.toBeInTheDocument();
    expect(screen.queryByText("R$ 41.000,00")).not.toBeInTheDocument();
    expect(
      await screen.findByText("Nenhuma amortização extraordinária registrada."),
    ).toBeInTheDocument();
    expect(await screen.findByText("Nenhum extrato registrado.")).toBeInTheDocument();
    expect(screen.queryByText("R$ 12.500,50")).not.toBeInTheDocument();
    expect(screen.queryByText("R$ 41.000,00")).not.toBeInTheDocument();
  });
});
