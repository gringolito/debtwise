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

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
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
            }
          : { current_payoff_date: "2024-06-10", payoff_date: "2024-06-10" },
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

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("radio", { name: "Extratos" }));
    await waitFor(() => expect(statementReads()).toBe(2));
  });
});

describe("a prepayment the server rejects", () => {
  it("shows the reason next to each field it names, before and on saving", async () => {
    const requests = stubMortgageApi({ mortgage: registeredMortgage });
    renderAt("/financiamento");

    const form = await openNewSheet();
    fill(form, "Data", "2023-12-09");
    fill(form, "Valor", "0");

    await within(form).findByText("Informe um valor maior que zero.");
    expect(within(form).getByLabelText("Data")).toBeInvalid();
    expect(within(form).getByLabelText("Data")).toHaveAccessibleDescription(
      "A data não pode ser anterior à data do contrato.",
    );
    expect(within(form).getByLabelText("Valor")).toBeInvalid();
    expect(within(form).getByLabelText("Valor")).toHaveAccessibleDescription(
      "Informe um valor maior que zero.",
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
    expect(within(form).getByLabelText("Valor")).toHaveValue("12500,50");
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

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
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

    await within(form).findByText("Informe um valor maior que zero.");
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
    renderAt("/financiamento");

    await openEditSheet("15/03/2024");
    fireEvent.click(screen.getByRole("button", { name: "Excluir amortização" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Excluir amortização extraordinária?",
    });
    expect(requests.some((req) => req.method === "DELETE")).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
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
