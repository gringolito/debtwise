import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CorrectionIndex, Schedule, ScheduledInstallment } from "@/lib/api";
import { rowTexts, text } from "@/test/dom";
import { stubMortgageApi } from "@/test/mortgageApi";
import { completeOnboarding } from "@/test/onboarding";
import {
  deferredSchedule,
  ipcaMortgage,
  ipcaSchedule,
  poupancaMortgage,
  poupancaSchedule,
  prepayments,
  projectedSchedule,
  registeredMortgage,
  schedule,
  scheduleAfterEvent,
  scheduleAfterSave,
  statements,
  trMortgage,
  trSchedule,
} from "@/test/mortgageFixtures";
import { renderAt } from "@/test/renderAt";
import { problem, stubRoutes } from "@/test/stubServer";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** setToday fakes only the clock, so timers and the server stub keep running. */
function setToday(date: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${date}T12:00:00`));
}

const installmentsTable = () => screen.findByRole("table", { name: "Prestações" });

function figures() {
  const summary = screen.getAllByRole("term").map((term) => term.closest("dl"))[0];
  return within(summary as HTMLElement)
    .getAllByRole("term")
    .map((term) => [text(term), text(term.nextElementSibling as HTMLElement)]);
}

const header = ["Nº", "Vencimento", "Prestação", "Juros", "Amortização", "Saldo após", "Detalhes"];

describe("navigation", () => {
  it("links the sidebar to the home page and to the mortgage", async () => {
    stubMortgageApi({ mortgage: registeredMortgage });
    renderAt("/");

    fireEvent.click(await screen.findByRole("link", { name: "Financiamento" }));

    expect(await installmentsTable()).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Início" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Início" })).toBeInTheDocument();
  });
});

describe("loading the mortgage page", () => {
  it("shows skeletons until the schedule arrives", async () => {
    stubRoutes({ "GET /api/mortgage/schedule": () => new Promise<Response>(() => {}) });

    renderAt("/financiamento");

    expect(
      await screen.findByRole("status", { name: "Carregando financiamento" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Editar contrato" })).toBeInTheDocument();
  });

  it("offers to retry when the schedule fails, and shows it once the server answers", async () => {
    let failing = true;
    stubRoutes({
      "GET /api/mortgage/schedule": () =>
        failing
          ? problem(500, "Internal Server Error", "unexpected failure")
          : Response.json(schedule),
    });
    setToday("2024-03-01");
    renderAt("/financiamento");

    const panel = await screen.findByRole("alert");
    expect(within(panel).getByRole("heading")).toHaveTextContent(
      "Não foi possível carregar seu financiamento",
    );
    failing = false;
    fireEvent.click(within(panel).getByRole("button", { name: "Tentar novamente" }));

    expect(await installmentsTable()).toBeInTheDocument();
  });
});

describe("the summary of the mortgage", () => {
  it("shows what is owed, the next installment and the payoff month", async () => {
    stubMortgageApi({ mortgage: registeredMortgage });
    setToday("2024-03-01");

    renderAt("/financiamento");

    await installmentsTable();
    expect(figures()).toEqual([
      ["Saldo devedor", "R$ 40.000,00"],
      ["Prestação atual", "R$ 10.434,50"],
      ["Quitação prevista", "junho de 2024"],
    ]);
    expect(screen.getByRole("link", { name: "Editar contrato" })).toHaveAttribute(
      "href",
      "/financiamento/editar",
    );
  });

  it("owes the amount financed before the first installment", async () => {
    stubMortgageApi({ mortgage: registeredMortgage });
    setToday("2023-12-20");

    renderAt("/financiamento");

    await installmentsTable();
    expect(figures()).toEqual([
      ["Saldo devedor", "R$ 60.000,00"],
      ["Prestação atual", "R$ 10.640,50"],
      ["Quitação prevista", "junho de 2024"],
    ]);
  });

  it("has no current installment once the schedule is paid off", async () => {
    stubMortgageApi({ mortgage: registeredMortgage });
    setToday("2024-07-01");

    renderAt("/financiamento");

    await installmentsTable();
    expect(figures()).toEqual([
      ["Saldo devedor", "R$ 0,00"],
      ["Prestação atual", "—"],
      ["Quitação prevista", "junho de 2024"],
    ]);
  });

  it("switches the chart between balance, installment and composition", async () => {
    stubMortgageApi({ mortgage: registeredMortgage });
    setToday("2024-03-01");
    renderAt("/financiamento");

    expect(
      await screen.findByRole("region", { name: "Saldo devedor ao longo do tempo" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Prestação" }));
    expect(screen.getByRole("region", { name: "Prestação ao longo do tempo" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Composição" }));
    expect(screen.getByRole("region", { name: "Composição da prestação" })).toBeInTheDocument();
  });
});

describe("the installments of the mortgage", () => {
  it("shows the installments with the current one marked and expanded", async () => {
    stubMortgageApi({ mortgage: registeredMortgage });
    setToday("2024-03-01");

    renderAt("/financiamento");

    const table = await installmentsTable();
    expect(rowTexts(table)).toEqual([
      header,
      ["1", "10/01/2024", "R$ 10.640,50", "R$ 600,00", "R$ 10.000,00", "R$ 50.000,00", ""],
      ["2", "10/02/2024", "R$ 10.537,50", "R$ 500,00", "R$ 10.000,00", "R$ 40.000,00", ""],
      ["3 Atual", "10/03/2024", "R$ 10.434,50", "R$ 400,00", "R$ 10.000,00", "R$ 30.000,00", ""],
      [
        "Correção R$ 0,00 Taxa de juros 12,682503% a.a. MIP R$ 12,00 DFI R$ 10,00 Taxa de administração R$ 12,50",
      ],
      ["4", "10/04/2024", "R$ 10.337,50", "R$ 300,00", "R$ 10.000,00", "R$ 20.000,00", ""],
      ["5", "10/05/2024", "R$ 10.232,50", "R$ 200,00", "R$ 10.000,00", "R$ 10.000,00", ""],
      ["6", "10/06/2024", "R$ 10.127,50", "R$ 100,00", "R$ 10.000,00", "R$ 0,00", ""],
    ]);
    expect(screen.getByRole("button", { name: "Detalhes da prestação 3" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.queryByRole("button", { name: /^Ver todas/ })).not.toBeInTheDocument();
  });

  it("expands and collapses an installment's correction, rate, insurance and fee", async () => {
    stubMortgageApi({ mortgage: registeredMortgage, schedule: scheduleAfterEvent });
    setToday("2024-03-01");
    renderAt("/financiamento");

    const table = await installmentsTable();
    const details = screen.getByRole("button", { name: "Detalhes da prestação 2" });
    fireEvent.click(details);

    expect(details).toHaveAttribute("aria-expanded", "true");
    expect(rowTexts(table)[3]).toEqual([
      "Correção R$ 0,00 Taxa de juros 12,682503% a.a. MIP R$ 15,00 DFI R$ 10,00 Taxa de administração R$ 12,50 Amortização extraordinária R$ 5.000,00",
    ]);
    fireEvent.click(details);
    expect(details).toHaveAttribute("aria-expanded", "false");
    expect(rowTexts(table)[3][0]).toBe("3 Atual");
  });

  describe("in a schedule longer than six", () => {
    const installment = (number: number): ScheduledInstallment => ({
      ...schedule.installments[0],
      number,
      due_date: `2024-${String(number).padStart(2, "0")}-10`,
    });
    const long: Schedule = {
      installments: Array.from({ length: 10 }, (_, i) => installment(i + 1)),
    };
    const numbers = (table: HTMLElement) =>
      rowTexts(table)
        .slice(1)
        .filter((cells) => cells.length > 1)
        .map((cells) => cells[0]);

    it.each([
      ["two before the current one", "2024-04-20", ["3", "4", "5 Atual", "6", "7", "8"]],
      [
        "the first ones before the first installment",
        "2023-12-20",
        ["1 Atual", "2", "3", "4", "5", "6"],
      ],
      ["the last ones once it is paid off", "2024-12-01", ["5", "6", "7", "8", "9", "10"]],
    ])("shows six installments: %s", async (_case, date, shown) => {
      stubMortgageApi({ mortgage: registeredMortgage, schedule: long });
      setToday(date);
      renderAt("/financiamento");

      expect(numbers(await installmentsTable())).toEqual(shown);
    });

    it("shows every installment on request, and six again after", async () => {
      stubMortgageApi({ mortgage: registeredMortgage, schedule: long });
      setToday("2024-04-20");
      renderAt("/financiamento");
      const table = await installmentsTable();

      fireEvent.click(screen.getByRole("button", { name: "Ver todas as 10 prestações" }));
      expect(numbers(table)).toEqual(["1", "2", "3", "4", "5 Atual", "6", "7", "8", "9", "10"]);

      fireEvent.click(screen.getByRole("button", { name: "Ver menos prestações" }));
      expect(numbers(table)).toEqual(["3", "4", "5 Atual", "6", "7", "8"]);
    });
  });
});

describe("the installments of an indexed mortgage", () => {
  async function detailsOf(number: number) {
    const table = await installmentsTable();
    const button = within(table).getByRole("button", { name: `Detalhes da prestação ${number}` });
    if (button.getAttribute("aria-expanded") === "false") fireEvent.click(button);
    const row = button.closest("tr")?.nextElementSibling as HTMLElement;
    return text(row);
  }

  it("shows each correction with the index value and period behind it", async () => {
    stubMortgageApi({ mortgage: trMortgage, schedule: trSchedule });
    setToday("2024-03-01");
    renderAt("/financiamento");

    expect(await detailsOf(1)).toBe(
      "Correção R$ 32,34 TR 0,0539% 10/12/2023 a 10/01/2024 Taxa de juros 12,682503% a.a. MIP R$ 18,00 DFI R$ 10,00 Taxa de administração R$ 12,50",
    );
    expect(await detailsOf(2)).toBe(
      "Correção R$ 0,00 TR Sem índice 10/01/2024 a 10/02/2024 Taxa de juros 12,682503% a.a. MIP R$ 15,00 DFI R$ 10,00 Taxa de administração R$ 12,50",
    );
    expect(await detailsOf(3)).toBe(
      "Correção R$ 0,00 Taxa de juros 12,682503% a.a. MIP R$ 12,00 DFI R$ 10,00 Taxa de administração R$ 12,50",
    );
  });

  it("shows an IPCA value with the month it is for", async () => {
    stubMortgageApi({ mortgage: ipcaMortgage, schedule: ipcaSchedule });
    setToday("2024-01-01");
    renderAt("/financiamento");

    expect(await detailsOf(1)).toBe(
      "Correção R$ 336,00 IPCA 0,56% dez/2023 Taxa de juros 12,682503% a.a. MIP R$ 18,00 DFI R$ 10,00 Taxa de administração R$ 12,50",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("warns above the installments how many months have no index value", async () => {
    stubMortgageApi({ mortgage: trMortgage, schedule: trSchedule });
    setToday("2024-03-01");
    renderAt("/financiamento");

    const alert = await screen.findByRole("alert");
    expect(text(alert)).toBe(
      "Faltam valores de TR para 1 mês. Esse mês não foi corrigido. Atualize os dados de mercado em Ajustes.",
    );
    expect(within(alert).getByRole("link", { name: "Ajustes" })).toHaveAttribute(
      "href",
      "/ajustes",
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(
      alert.compareDocumentPosition(await installmentsTable()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows no warning above the installments of a mortgage without an indexer", async () => {
    stubMortgageApi({ mortgage: registeredMortgage });
    setToday("2024-03-01");
    renderAt("/financiamento");

    await installmentsTable();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("counts every month without an index value", async () => {
    const missing = (start: string, end: string): CorrectionIndex => ({
      index: "tr",
      status: "missing",
      period_start: start,
      period_end: end,
      methods: [],
    });
    const [first, second, third] = trSchedule.installments;
    stubMortgageApi({
      mortgage: trMortgage,
      schedule: {
        installments: [
          { ...first, index_values: [missing("2023-12-10", "2024-01-10")] },
          { ...second, index_values: [missing("2024-01-10", "2024-02-10")] },
          third,
        ],
      },
    });
    setToday("2024-03-01");
    renderAt("/financiamento");

    expect(text(await screen.findByRole("alert"))).toBe(
      "Faltam valores de TR para 2 meses. Esses meses não foram corrigidos. Atualize os dados de mercado em Ajustes.",
    );
  });

  it("lists each index value of an installment on its own line and counts the missing ones", async () => {
    stubMortgageApi({ mortgage: trMortgage, schedule: deferredSchedule });
    setToday("2024-03-01");
    renderAt("/financiamento");

    expect(await detailsOf(1)).toBe(
      "Correção R$ 108,30 TR Sem índice 10/12/2023 a 10/01/2024 TR Sem índice 10/01/2024 a 10/02/2024 TR 0,2166% 10/02/2024 a 10/03/2024 Taxa de juros 12,682503% a.a. MIP R$ 18,00 DFI R$ 10,00 Taxa de administração R$ 12,50",
    );
    expect(text(await screen.findByRole("alert"))).toBe(
      "Faltam valores de TR para 2 meses. Esses meses não foram corrigidos. Atualize os dados de mercado em Ajustes.",
    );
  });

  it("marks a projected value and names the projection methods behind it", async () => {
    stubMortgageApi({ mortgage: trMortgage, schedule: projectedSchedule });
    setToday("2024-03-01");
    renderAt("/financiamento");

    expect(await detailsOf(3)).toBe(
      "Correção R$ 7,50 TR 0,0150% Projetado 10/02/2024 a 10/03/2024 TR: Média dos últimos 12 meses Taxa de juros 11,91% a.a. Selic meta 10,50% Projetado 29/02/2024 Selic meta: Mediana do Focus (BCB) MIP R$ 12,00 DFI R$ 10,00 Taxa de administração R$ 12,50",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the rate charged with the Selic target reading behind its poupança part", async () => {
    stubMortgageApi({ mortgage: poupancaMortgage, schedule: poupancaSchedule });
    setToday("2024-03-01");
    renderAt("/financiamento");

    expect(await detailsOf(1)).toBe(
      "Correção R$ 32,34 TR 0,0539% 10/12/2023 a 10/01/2024 Taxa de juros 12,33778% a.a. Selic meta 11,75% 06/12/2023 MIP R$ 18,00 DFI R$ 10,00 Taxa de administração R$ 12,50",
    );
    expect(await detailsOf(2)).toBe(
      "Correção R$ 0,00 Taxa de juros 6,17% a.a. Selic meta Sem índice 31/01/2024 MIP R$ 12,00 DFI R$ 10,00 Taxa de administração R$ 12,50",
    );
  });

  it("warns apart from the correction warning that the rate lacks Selic target values", async () => {
    stubMortgageApi({ mortgage: poupancaMortgage, schedule: poupancaSchedule });
    setToday("2024-03-01");
    renderAt("/financiamento");

    const alert = await screen.findByRole("alert");
    expect(text(alert)).toBe(
      "Faltam valores de Selic meta para 1 mês. A taxa de juros desse mês não inclui o adicional da poupança. Atualize os dados de mercado em Ajustes.",
    );
    expect(within(alert).getByRole("link", { name: "Ajustes" })).toHaveAttribute(
      "href",
      "/ajustes",
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(
      alert.compareDocumentPosition(await installmentsTable()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("counts every month without a Selic target value", async () => {
    const [first, second] = poupancaSchedule.installments;
    stubMortgageApi({
      mortgage: poupancaMortgage,
      schedule: {
        installments: [{ ...first, rate_index_values: second.rate_index_values }, second],
      },
    });
    setToday("2024-03-01");
    renderAt("/financiamento");

    expect(text(await screen.findByRole("alert"))).toBe(
      "Faltam valores de Selic meta para 2 meses. A taxa de juros desses meses não inclui o adicional da poupança. Atualize os dados de mercado em Ajustes.",
    );
  });

  it("keeps the correction warning when the rate warning shows too", async () => {
    const [first, second] = trSchedule.installments;
    const [, withMissingSelic] = poupancaSchedule.installments;
    stubMortgageApi({
      mortgage: poupancaMortgage,
      schedule: {
        installments: [first, { ...second, rate_index_values: withMissingSelic.rate_index_values }],
      },
    });
    setToday("2024-03-01");
    renderAt("/financiamento");

    await installmentsTable();
    expect(screen.getAllByRole("alert").map(text)).toEqual([
      "Faltam valores de TR para 1 mês. Esse mês não foi corrigido. Atualize os dados de mercado em Ajustes.",
      "Faltam valores de Selic meta para 1 mês. A taxa de juros desse mês não inclui o adicional da poupança. Atualize os dados de mercado em Ajustes.",
    ]);
  });
});

describe("a schedule that changed on the server", () => {
  const oldAmounts = ["R$ 10.640,50", "R$ 10.537,50", "R$ 10.127,50"];

  async function expectOnlyNewSchedule() {
    await screen.findByRole("heading", { name: "Financiamento" });
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
    setToday("2024-03-01");
    renderAt("/financiamento");
    expect(await screen.findByText("R$ 10.640,50")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Editar contrato" }));
    fireEvent.click(await screen.findByRole("button", { name: "Salvar" }));

    await expectOnlyNewSchedule();
  });

  it("never shows the old schedule after the mortgage is deleted and registered again", async () => {
    stubMortgageApi({
      mortgage: registeredMortgage,
      onSave: () => registeredMortgage,
      scheduleAfterSave,
    });
    setToday("2024-03-01");
    renderAt("/financiamento");
    expect(await screen.findByText("R$ 10.640,50")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Ajustes" }));
    fireEvent.click(await screen.findByRole("button", { name: "Excluir financiamento" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));
    await completeOnboarding();
    fireEvent.click(await screen.findByRole("link", { name: "Financiamento" }));

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
    setToday("2024-03-01");
    renderAt("/financiamento");
    fireEvent.click(await screen.findByRole("radio", { name: "Amortizações" }));
    expect(await screen.findByText("R$ 12.500,50")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Extratos" }));
    expect(await screen.findByText("R$ 41.000,00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Ajustes" }));
    fireEvent.click(await screen.findByRole("button", { name: "Excluir financiamento" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));
    await completeOnboarding();
    fireEvent.click(await screen.findByRole("link", { name: "Financiamento" }));

    fireEvent.click(await screen.findByRole("radio", { name: "Amortizações" }));
    expect(screen.queryByText("R$ 12.500,50")).not.toBeInTheDocument();
    expect(await screen.findByText("Nenhuma amortização registrada.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Extratos" }));
    expect(screen.queryByText("R$ 41.000,00")).not.toBeInTheDocument();
    expect(await screen.findByText("Nenhum extrato registrado.")).toBeInTheDocument();
  });
});
