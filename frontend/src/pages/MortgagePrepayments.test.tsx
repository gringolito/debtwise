import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rowTexts, text } from "@/test/dom";
import { stubMortgageApi } from "@/test/mortgageApi";
import {
  prepayments,
  registeredMortgage,
  schedule,
  scheduleAfterEvent,
  statements,
} from "@/test/mortgageFixtures";
import { renderAt } from "@/test/renderAt";
import { problem, stubRoutes } from "@/test/stubServer";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setToday(date: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${date}T12:00:00`));
}

function fill(form: HTMLElement, label: string, value: string) {
  fireEvent.change(within(form).getByLabelText(label), { target: { value } });
}

function bodies(requests: { method: string; url: string; body?: unknown }[], method: string) {
  return requests
    .filter((req) => req.method === method)
    .map((req) => [new URL(req.url).pathname, req.body]);
}

async function openTab() {
  fireEvent.click(await screen.findByRole("radio", { name: "Amortizações" }));
}

async function openNewSheet() {
  fireEvent.click(await screen.findByRole("button", { name: "Registrar amortização" }));
  return screen.findByRole("form", { name: "Registrar amortização" });
}

async function openEditSheet(when: string) {
  await openTab();
  fireEvent.click(await screen.findByRole("button", { name: `Editar amortização de ${when}` }));
  return screen.findByRole("form", { name: `Editar amortização de ${when}` });
}

const list = () => screen.findByRole("list", { name: "Amortizações registradas" });
const rows = async () =>
  within(await list())
    .getAllByRole("button")
    .map(text);

/** feedback is the dialog that opens as the sheet closes once a change is saved. */
async function feedback(name: string) {
  await waitFor(() => expect(screen.queryByRole("form")).toBeNull());
  return screen.getByRole("dialog", { name });
}

async function dismiss(dialog: HTMLElement, button: string) {
  expect(within(dialog).getAllByRole("button").map(text)).toEqual([button]);
  expect(within(dialog).getByRole("button", { name: button })).toHaveFocus();
  fireEvent.click(within(dialog).getByRole("button", { name: button }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

const facts = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole("term")
    .map((term) => [text(term), text(term.nextElementSibling as HTMLElement)]);

describe("the prepayments of the mortgage", () => {
  it("lists every prepayment newest first with what it changed, under the totals", async () => {
    stubMortgageApi({ mortgage: registeredMortgage, prepayments });
    renderAt("/financiamento");

    await openTab();

    expect(await rows()).toEqual([
      "02/04/2024 Reduzir prazo R$ 1.234,00",
      "15/03/2024 Reduziu a prestação em R$ 1.250,05 R$ 12.500,50",
      "20/02/2024 Reduziu o prazo em 1 mês R$ 5.000,00",
    ]);
    const totals = screen.getByText("Total amortizado").closest("dl") as HTMLElement;
    const terms = within(totals).getAllByRole("term");
    expect(terms.map((term) => [text(term), text(term.nextElementSibling as HTMLElement)])).toEqual(
      [
        ["Total amortizado", "R$ 18.734,50"],
        ["Prazo reduzido", "1 mês"],
      ],
    );
  });

  it("says so when no prepayment is recorded", async () => {
    stubMortgageApi({ mortgage: registeredMortgage });
    renderAt("/financiamento");

    await openTab();

    expect(await screen.findByText("Nenhuma amortização registrada.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Amortizações registradas" })).toBeNull();
  });

  it("offers to retry when the prepayments fail to load", async () => {
    let failing = true;
    stubRoutes({
      "GET /api/mortgage": () => Response.json(registeredMortgage),
      "GET /api/mortgage/schedule": () => Response.json(schedule),
      "GET /api/mortgage/prepayments": () =>
        failing
          ? problem(500, "Internal Server Error", "unexpected failure")
          : Response.json({ prepayments, total_amount: "18734.50", months_shortened: 1 }),
    });
    renderAt("/financiamento");
    await openTab();

    const panel = await screen.findByRole("alert");
    expect(within(panel).getByRole("heading")).toHaveTextContent(
      "Não foi possível carregar as amortizações",
    );
    failing = false;
    fireEvent.click(within(panel).getByRole("button", { name: "Tentar novamente" }));

    expect(await rows()).toHaveLength(3);
  });
});

describe("recording a prepayment", () => {
  it("previews the payoff, records it and shows the schedule that replays it", async () => {
    const requests = stubMortgageApi({
      mortgage: registeredMortgage,
      scheduleAfterChange: scheduleAfterEvent,
      prepaymentPreview: () => ({
        current_payoff_date: "2024-06-10",
        payoff_date: "2024-05-10",
        current_installment: "10434.50",
        installment: "10434.50",
        money_saved: "312.40",
      }),
    });
    setToday("2024-02-20");
    renderAt("/financiamento");

    const form = await openNewSheet();
    expect(within(form).getByLabelText("Data")).toHaveValue("2024-02-20");
    expect(within(form).getByRole("radio", { name: "Reduzir prazo" })).toBeChecked();
    fill(form, "Valor", "5.000,00");

    expect(await within(form).findByRole("status")).toHaveTextContent(
      "Quitação passa de junho de 2024 para maio de 2024",
    );
    expect(bodies(requests, "POST")).toEqual([
      [
        "/api/mortgage/prepayments/preview",
        { date: "2024-02-20", amount: "5000.00", effect: "shorten_term" },
      ],
    ]);
    fireEvent.click(within(form).getByRole("button", { name: "Registrar" }));

    await dismiss(await feedback("Amortização registrada!"), "Continuar");
    expect(bodies(requests, "POST").at(-1)).toEqual([
      "/api/mortgage/prepayments",
      { date: "2024-02-20", amount: "5000.00", effect: "shorten_term" },
    ]);
    const table = await screen.findByRole("table", { name: "Prestações" });
    fireEvent.click(within(table).getByRole("button", { name: "Detalhes da prestação 2" }));
    await waitFor(() =>
      expect(text(within(table).getAllByRole("row")[3])).toContain(
        "Amortização extraordinária R$ 5.000,00",
      ),
    );
    await openTab();
    expect(await rows()).toEqual(["20/02/2024 Reduzir prazo R$ 5.000,00"]);
  });

  it("previews the installment when the prepayment lowers it", async () => {
    stubMortgageApi({
      mortgage: registeredMortgage,
      prepaymentPreview: (input) =>
        input.effect === "lower_installment"
          ? {
              current_payoff_date: "2024-06-10",
              payoff_date: "2024-06-10",
              current_installment: "10434.50",
              installment: "9184.45",
              money_saved: "845.15",
            }
          : { current_payoff_date: "2024-06-10", payoff_date: "2024-06-10", money_saved: "312.40" },
    });
    renderAt("/financiamento");

    const form = await openNewSheet();
    fill(form, "Data", "2024-02-20");
    fill(form, "Valor", "5.000,00");
    expect(await within(form).findByRole("status")).toHaveTextContent(
      "A quitação continua em junho de 2024.",
    );
    fireEvent.click(within(form).getByRole("radio", { name: "Reduzir prestação" }));

    await waitFor(() =>
      expect(within(form).getByRole("status")).toHaveTextContent(
        "Prestação passa de R$ 10.434,50 para R$ 9.184,45",
      ),
    );
  });

  it("refetches the statements too, because a prepayment moves their drift", async () => {
    const requests = stubMortgageApi({ mortgage: registeredMortgage, statements });
    renderAt("/financiamento");
    fireEvent.click(await screen.findByRole("radio", { name: "Extratos" }));
    await screen.findByRole("table", { name: "Extratos registrados" });
    const statementReads = () =>
      requests.filter(
        (req) => req.method === "GET" && new URL(req.url).pathname === "/api/mortgage/statements",
      ).length;
    expect(statementReads()).toBe(1);

    fireEvent.click(await screen.findByRole("radio", { name: "Prestações" }));
    const form = await openNewSheet();
    fill(form, "Data", "2024-02-20");
    fill(form, "Valor", "5.000,00");
    fireEvent.click(within(form).getByRole("button", { name: "Registrar" }));

    await dismiss(await feedback("Amortização registrada!"), "Continuar");
    fireEvent.click(screen.getByRole("radio", { name: "Extratos" }));
    await waitFor(() => expect(statementReads()).toBe(2));
  });
});

// The schedule once a prepayment on 2024-02-20 lowers installments 3 to 6.
const scheduleWithLowerInstallments = {
  installments: schedule.installments.map((installment) =>
    installment.number >= 3 ? { ...installment, amount: "9184.45" } : installment,
  ),
};

describe("celebrating a recorded prepayment", () => {
  async function record(effect: "Reduzir prazo" | "Reduzir prestação") {
    const form = await openNewSheet();
    fill(form, "Valor", "5.000,00");
    fireEvent.click(within(form).getByRole("radio", { name: effect }));
    fireEvent.click(within(form).getByRole("button", { name: "Registrar" }));
  }

  it("shows what a prepayment that shortens the term saves, with every prepayment's", async () => {
    stubMortgageApi({
      mortgage: registeredMortgage,
      prepayments,
      scheduleAfterChange: { installments: schedule.installments.slice(0, 5) },
      prepaymentOutcome: () => ({
        months_shortened: 1,
        installment_reduction: "0.00",
        money_saved: "520.30",
      }),
    });
    setToday("2024-02-20");
    renderAt("/financiamento");

    await record("Reduzir prazo");

    const dialog = await feedback("Amortização registrada!");
    expect(within(dialog).getByText("R$ 520,30").closest("p")).toHaveTextContent(
      "Na projeção atual, ela economiza R$ 520,30 em juros, seguros e taxas",
    );
    expect(facts(dialog)).toEqual([
      ["Prazo reduzido", "1 mês"],
      ["Quitação prevista", "maio de 2024"],
    ]);
    expect(
      within(dialog).getByText(/^Com todas as amortizações/, { selector: "p" }),
    ).toHaveTextContent(
      "Com todas as amortizações, você economiza R$ 1.719,12 e 2 meses de prazo.",
    );
    await dismiss(dialog, "Continuar");
  });

  it("shows the installment a prepayment lowered, from what it was to what it is", async () => {
    stubMortgageApi({
      mortgage: registeredMortgage,
      scheduleAfterChange: scheduleWithLowerInstallments,
      prepaymentOutcome: () => ({
        months_shortened: 0,
        installment_reduction: "1250.05",
        money_saved: "845.15",
      }),
    });
    setToday("2024-02-20");
    renderAt("/financiamento");

    await record("Reduzir prestação");

    const dialog = await feedback("Amortização registrada!");
    expect(facts(dialog)).toEqual([["Prestação", "R$ 10.434,50 para R$ 9.184,45"]]);
    expect(
      within(dialog).getByText(/^Com todas as amortizações/, { selector: "p" }),
    ).toHaveTextContent("Com todas as amortizações, você economiza R$ 845,15.");
  });

  it.each(["Reduzir prazo", "Reduzir prestação"] as const)(
    "celebrates a payoff with the money and the time saved, under %s",
    async (effect) => {
      stubMortgageApi({
        mortgage: registeredMortgage,
        scheduleAfterChange: { installments: schedule.installments.slice(0, 2) },
        prepaymentOutcome: () => ({
          months_shortened: 4,
          installment_reduction: "10434.50",
          money_saved: "1000.00",
        }),
      });
      setToday("2024-02-20");
      renderAt("/financiamento");

      await record(effect);

      const dialog = await feedback("Financiamento quitado!");
      expect(within(dialog).getByText("R$ 1.000,00").closest("p")).toHaveTextContent(
        "Na projeção atual, ela economiza R$ 1.000,00 em juros, seguros e taxas",
      );
      expect(facts(dialog)).toEqual([["Prazo reduzido", "4 meses"]]);
      await dismiss(dialog, "Continuar");
    },
  );

  it("celebrates no payoff when the mortgage was paid off before the prepayment", async () => {
    stubMortgageApi({
      mortgage: registeredMortgage,
      schedule: { installments: schedule.installments.slice(0, 2) },
    });
    setToday("2024-02-20");
    renderAt("/financiamento");

    await record("Reduzir prazo");

    const dialog = await feedback("Amortização registrada!");
    expect(facts(dialog)).toEqual([["Quitação prevista", "fevereiro de 2024"]]);
  });
});

describe("a prepayment the server rejects", () => {
  it("shows the reason next to each field it names, before and on saving", async () => {
    const requests = stubMortgageApi({ mortgage: registeredMortgage });
    renderAt("/financiamento");

    const form = await openNewSheet();
    fill(form, "Data", "2023-12-09");
    fill(form, "Valor", "0");

    await within(form).findByText("Precisa ser maior que zero.");
    expect(within(form).getByLabelText("Data")).toBeInvalid();
    expect(within(form).getByLabelText("Data")).toHaveAccessibleDescription(
      "Não pode ser antes da data do contrato.",
    );
    expect(within(form).getByLabelText("Valor")).toBeInvalid();
    expect(within(form).getByLabelText("Valor")).toHaveAccessibleDescription(
      "Precisa ser maior que zero.",
    );
    expect(within(form).queryByRole("status")).toBeNull();
    fireEvent.click(within(form).getByRole("button", { name: "Registrar" }));

    await waitFor(() =>
      expect(bodies(requests, "POST").map(([path]) => path)).toContain("/api/mortgage/prepayments"),
    );
    expect(within(form).getByLabelText("Valor")).toBeInvalid();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says it could not record when the failure names no field", async () => {
    stubRoutes({
      "GET /api/mortgage": () => Response.json(registeredMortgage),
      "GET /api/mortgage/schedule": () => Response.json(schedule),
      "POST /api/mortgage/prepayments/preview": () =>
        Response.json({ current_payoff_date: "2024-06-10", payoff_date: "2024-06-10" }),
      "POST /api/mortgage/prepayments": () =>
        problem(500, "Internal Server Error", "unexpected failure", [
          { location: "body.amount", message: "boom" },
        ]),
    });
    renderAt("/financiamento");

    const form = await openNewSheet();
    fill(form, "Data", "2024-02-20");
    fill(form, "Valor", "5.000,00");
    fireEvent.click(within(form).getByRole("button", { name: "Registrar" }));

    expect(await within(form).findByRole("alert")).toHaveTextContent(
      "Não foi possível registrar a amortização extraordinária.",
    );
    expect(within(form).getByLabelText("Valor")).toHaveValue("5.000,00");
    expect(within(form).getByLabelText("Data")).toBeValid();
    expect(within(form).getByLabelText("Valor")).toBeValid();
  });
});

describe("editing a prepayment", () => {
  it("fills the sheet with the prepayment, previews it in its place and saves it", async () => {
    const requests = stubMortgageApi({
      mortgage: registeredMortgage,
      prepayments,
      scheduleAfterChange: scheduleAfterEvent,
    });
    renderAt("/financiamento");

    const form = await openEditSheet("15/03/2024");
    expect(within(form).getByLabelText("Data")).toHaveValue("2024-03-15");
    expect(within(form).getByLabelText("Valor")).toHaveValue("12.500,50");
    expect(within(form).getByRole("radio", { name: "Reduzir prestação" })).toBeChecked();
    fill(form, "Data", "2024-01-20");
    fill(form, "Valor", "13.000,00");
    fireEvent.click(within(form).getByRole("radio", { name: "Reduzir prazo" }));
    await waitFor(() =>
      expect(bodies(requests, "POST").at(-1)).toEqual([
        "/api/mortgage/prepayments/preview",
        { date: "2024-01-20", amount: "13000.00", effect: "shorten_term", replaces: 2 },
      ]),
    );
    fireEvent.click(within(form).getByRole("button", { name: "Salvar" }));

    await dismiss(await feedback("Amortização atualizada"), "Entendi");
    expect(bodies(requests, "PUT")).toEqual([
      [
        "/api/mortgage/prepayments/2",
        { date: "2024-01-20", amount: "13000.00", effect: "shorten_term" },
      ],
    ]);
    await waitFor(async () =>
      expect(await rows()).toEqual([
        "02/04/2024 Reduzir prazo R$ 1.234,00",
        "20/02/2024 Reduziu o prazo em 1 mês R$ 5.000,00",
        "20/01/2024 Reduzir prazo R$ 13.000,00",
      ]),
    );
  });

  it("tells where an edit leaves the payoff and the money the prepayment saves", async () => {
    stubMortgageApi({
      mortgage: registeredMortgage,
      prepayments,
      scheduleAfterChange: { installments: schedule.installments.slice(0, 5) },
      prepaymentOutcome: () => ({
        months_shortened: 1,
        installment_reduction: "0.00",
        money_saved: "610.00",
      }),
    });
    renderAt("/financiamento");

    const form = await openEditSheet("15/03/2024");
    fireEvent.click(within(form).getByRole("radio", { name: "Reduzir prazo" }));
    fireEvent.click(within(form).getByRole("button", { name: "Salvar" }));

    const dialog = await feedback("Amortização atualizada");
    expect(within(dialog).getByText(/^Na projeção atual/)).toHaveTextContent(
      "Na projeção atual, o financiamento fica assim:",
    );
    expect(facts(dialog)).toEqual([
      ["Quitação prevista", "junho de 2024 para maio de 2024"],
      ["Economia", "R$ 845,15 para R$ 610,00"],
    ]);
    await dismiss(dialog, "Entendi");
  });

  it("tells where an edit leaves the installment the prepayment lowers", async () => {
    stubMortgageApi({
      mortgage: registeredMortgage,
      prepayments,
      scheduleAfterChange: scheduleWithLowerInstallments,
      prepaymentOutcome: () => ({
        months_shortened: 0,
        installment_reduction: "1153.05",
        money_saved: "900.00",
      }),
    });
    renderAt("/financiamento");

    const form = await openEditSheet("15/03/2024");
    fill(form, "Valor", "13.000,00");
    fireEvent.click(within(form).getByRole("button", { name: "Salvar" }));

    const dialog = await feedback("Amortização atualizada");
    expect(facts(dialog)).toEqual([
      ["Prestação", "R$ 10.337,50 para R$ 9.184,45"],
      ["Economia", "R$ 845,15 para R$ 900,00"],
    ]);
  });

  it("keeps the prepayment when the owner cancels", async () => {
    const requests = stubMortgageApi({ mortgage: registeredMortgage, prepayments });
    renderAt("/financiamento");

    const form = await openEditSheet("15/03/2024");
    fill(form, "Valor", "1,00");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("R$ 12.500,50")).toBeInTheDocument();
    expect(requests.some((req) => req.method === "PUT")).toBe(false);
  });

  it("shows the reason next to the field the server rejects", async () => {
    stubMortgageApi({ mortgage: registeredMortgage, prepayments });
    renderAt("/financiamento");

    const form = await openEditSheet("15/03/2024");
    fill(form, "Valor", "0");
    fireEvent.click(within(form).getByRole("button", { name: "Salvar" }));

    await within(form).findByText("Precisa ser maior que zero.");
    expect(within(form).getByLabelText("Valor")).toBeInvalid();
    expect(within(form).getByLabelText("Data")).toBeValid();
  });

  it("shows the generic alert and marks no field when the server fails to save", async () => {
    stubRoutes({
      "GET /api/mortgage": () => Response.json(registeredMortgage),
      "GET /api/mortgage/schedule": () => Response.json(schedule),
      "GET /api/mortgage/prepayments": () =>
        Response.json({ prepayments, total_amount: "18734.50", months_shortened: 1 }),
      "POST /api/mortgage/prepayments/preview": () =>
        Response.json({ current_payoff_date: "2024-06-10", payoff_date: "2024-06-10" }),
      "PUT /api/mortgage/prepayments/:id": () =>
        problem(500, "Internal Server Error", "unexpected failure", [
          { location: "body.amount", message: "boom" },
        ]),
    });
    renderAt("/financiamento");

    const form = await openEditSheet("15/03/2024");
    fill(form, "Valor", "13.000,00");
    fireEvent.click(within(form).getByRole("button", { name: "Salvar" }));

    expect(await within(form).findByRole("alert")).toHaveTextContent(
      "Não foi possível salvar a amortização extraordinária.",
    );
    expect(within(form).getByLabelText("Data")).toBeValid();
    expect(within(form).getByLabelText("Valor")).toBeValid();
    expect(within(form).getByLabelText("Valor")).toHaveValue("13.000,00");
  });
});

describe("deleting a prepayment", () => {
  it("asks for confirmation, deletes it and shows the schedule without it", async () => {
    const requests = stubMortgageApi({
      mortgage: registeredMortgage,
      prepayments,
      schedule: scheduleAfterEvent,
      scheduleAfterChange: schedule,
    });
    setToday("2024-02-20");
    renderAt("/financiamento");

    await openEditSheet("15/03/2024");
    fireEvent.click(screen.getByRole("button", { name: "Excluir amortização" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Excluir amortização extraordinária?",
    });
    expect(requests.some((req) => req.method === "DELETE")).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));

    const notice = await feedback("Amortização excluída");
    expect(within(notice).getByText(/^Na projeção atual/)).toHaveTextContent(
      "Na projeção atual, o financiamento fica assim:",
    );
    expect(facts(notice)).toEqual([
      ["Quitação prevista", "junho de 2024"],
      ["Prestação atual", "R$ 10.434,50"],
      ["Economia com amortizações", "R$ 353,67"],
    ]);
    await dismiss(notice, "Entendi");
    expect(bodies(requests, "DELETE")).toEqual([["/api/mortgage/prepayments/2", undefined]]);
    expect(await rows()).toEqual([
      "02/04/2024 Reduzir prazo R$ 1.234,00",
      "20/02/2024 Reduziu o prazo em 1 mês R$ 5.000,00",
    ]);
    fireEvent.click(screen.getByRole("radio", { name: "Prestações" }));
    const table = await screen.findByRole("table", { name: "Prestações" });
    fireEvent.click(within(table).getByRole("button", { name: "Detalhes da prestação 2" }));
    await waitFor(() =>
      expect(rowTexts(table).flat().join(" ")).not.toContain("Amortização extraordinária"),
    );
  });

  it("keeps the prepayment when the owner cancels", async () => {
    const requests = stubMortgageApi({ mortgage: registeredMortgage, prepayments });
    renderAt("/financiamento");

    await openEditSheet("15/03/2024");
    fireEvent.click(screen.getByRole("button", { name: "Excluir amortização" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(requests.some((req) => req.method === "DELETE")).toBe(false);
    expect(screen.getByRole("form", { name: "Editar amortização de 15/03/2024" })).toBeVisible();
  });

  it("says so when the server refuses to delete", async () => {
    stubRoutes({
      "GET /api/mortgage": () => Response.json(registeredMortgage),
      "GET /api/mortgage/schedule": () => Response.json(schedule),
      "GET /api/mortgage/prepayments": () =>
        Response.json({ prepayments, total_amount: "18734.50", months_shortened: 1 }),
      "POST /api/mortgage/prepayments/preview": () =>
        Response.json({ current_payoff_date: "2024-06-10", payoff_date: "2024-06-10" }),
      "DELETE /api/mortgage/prepayments/:id": () =>
        problem(500, "Internal Server Error", "unexpected failure"),
    });
    renderAt("/financiamento");

    await openEditSheet("15/03/2024");
    fireEvent.click(screen.getByRole("button", { name: "Excluir amortização" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível excluir a amortização extraordinária.",
    );
    expect(screen.getByRole("dialog")).toBeVisible();
  });
});
