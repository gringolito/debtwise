import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rowTexts } from "@/test/dom";
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
  vi.unstubAllGlobals();
});

const prepaymentForm = () =>
  screen.findByRole("form", { name: "Registrar amortização extraordinária" });

function fill(form: HTMLElement, label: string, value: string) {
  fireEvent.change(within(form).getByLabelText(label), { target: { value } });
}

function bodies(requests: { method: string; body?: unknown }[], method: string) {
  return requests.filter((req) => req.method === method).map((req) => req.body);
}

const region = () => screen.findByRole("region", { name: "Amortizações extraordinárias" });

describe("the prepayments of the mortgage", () => {
  it("lists every prepayment in the order the server sends them", async () => {
    stubMortgageApi({ mortgage: registeredMortgage, prepayments });

    renderAt("/financiamento");

    const table = await within(await region()).findByRole("table");
    expect(rowTexts(table).map((cells) => cells.slice(0, 3))).toEqual([
      ["Data", "Valor", "Efeito"],
      ["20/02/2024", "R$ 5.000,00", "Reduzir prazo"],
      ["15/03/2024", "R$ 12.500,50", "Reduzir prestação"],
      ["02/04/2024", "R$ 1.234,00", "Reduzir prazo"],
    ]);
    expect(
      within(table)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Editar amortização de 20/02/2024",
      "Excluir amortização de 20/02/2024",
      "Editar amortização de 15/03/2024",
      "Excluir amortização de 15/03/2024",
      "Editar amortização de 02/04/2024",
      "Excluir amortização de 02/04/2024",
    ]);
  });

  it("says so when no prepayment is recorded", async () => {
    stubMortgageApi({ mortgage: registeredMortgage });

    renderAt("/financiamento");

    const section = await region();
    expect(
      await within(section).findByText("Nenhuma amortização extraordinária registrada."),
    ).toBeInTheDocument();
    expect(within(section).queryByRole("table")).not.toBeInTheDocument();
  });

  it("records a prepayment and then shows it and the schedule that replays it", async () => {
    const requests = stubMortgageApi({
      mortgage: registeredMortgage,
      scheduleAfterChange: scheduleAfterEvent,
    });
    renderAt("/financiamento");

    const form = await prepaymentForm();
    fill(form, "Data", "2024-02-20");
    fill(form, "Valor", "5.000,00");
    fill(form, "Efeito", "lower_installment");
    fireEvent.click(within(form).getByRole("button", { name: "Registrar" }));

    const table = await within(await region()).findByRole("table");
    expect(rowTexts(table).map((cells) => cells.slice(0, 3))).toEqual([
      ["Data", "Valor", "Efeito"],
      ["20/02/2024", "R$ 5.000,00", "Reduzir prestação"],
    ]);
    expect(bodies(requests, "POST")).toEqual([
      { date: "2024-02-20", amount: "5000.00", effect: "lower_installment" },
    ]);
    const schedule = screen.getByRole("table", { name: "Evolução do financiamento" });
    expect(rowTexts(schedule)[2]).toEqual([
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
      "R$ 5.000,00",
      "R$ 35.000,00",
    ]);
    expect(within(form).getByLabelText("Valor")).toHaveValue("");
  });

  it("refetches the statements too, because a prepayment moves their drift", async () => {
    const requests = stubMortgageApi({ mortgage: registeredMortgage, statements });
    renderAt("/financiamento");
    const statementReads = () =>
      requests.filter(
        (req) => req.method === "GET" && new URL(req.url).pathname === "/api/mortgage/statements",
      ).length;
    const form = await prepaymentForm();
    await screen.findByRole("table", { name: "Extratos registrados" });
    expect(statementReads()).toBe(1);

    fill(form, "Data", "2024-02-20");
    fill(form, "Valor", "5.000,00");
    fireEvent.click(within(form).getByRole("button", { name: "Registrar" }));

    await within(await region()).findByRole("table");
    expect(statementReads()).toBe(2);
  });
});

describe("a prepayment the server rejects", () => {
  it("shows the reason next to each field it names", async () => {
    stubMortgageApi({ mortgage: registeredMortgage });
    renderAt("/financiamento");

    const form = await prepaymentForm();
    fill(form, "Data", "2023-12-09");
    fill(form, "Valor", "0");
    fireEvent.click(within(form).getByRole("button", { name: "Registrar" }));

    await screen.findByText("Informe um valor maior que zero.");
    expect(within(form).getByLabelText("Data")).toBeInvalid();
    expect(within(form).getByLabelText("Data")).toHaveAccessibleDescription(
      "A data não pode ser anterior à data do contrato.",
    );
    expect(within(form).getByLabelText("Valor")).toBeInvalid();
    expect(within(form).getByLabelText("Valor")).toHaveAccessibleDescription(
      "Informe um valor maior que zero.",
    );
    expect(within(form).getByLabelText("Efeito")).toBeValid();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says it could not record when the failure names no field", async () => {
    stubRoutes({
      "GET /api/mortgage": () => Response.json(registeredMortgage),
      "GET /api/mortgage/schedule": () => Response.json({ installments: [] }),
      "GET /api/mortgage/prepayments": () => Response.json({ prepayments: [] }),
      "GET /api/mortgage/statements": () => Response.json({ statements: [] }),
      "POST /api/mortgage/prepayments": () =>
        problem(500, "Internal Server Error", "unexpected failure"),
    });
    renderAt("/financiamento");

    const form = await prepaymentForm();
    fill(form, "Data", "2024-02-20");
    fill(form, "Valor", "5.000,00");
    fireEvent.click(within(form).getByRole("button", { name: "Registrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível registrar a amortização extraordinária.",
    );
    expect(within(form).getByLabelText("Valor")).toHaveValue("5.000,00");
  });
});

describe("editing a prepayment", () => {
  const edit = (when: string) =>
    screen.findByRole("form", { name: `Editar amortização de ${when}` });

  it("fills the form with the prepayment and replaces it with what the owner saves", async () => {
    const requests = stubMortgageApi({
      mortgage: registeredMortgage,
      prepayments,
      scheduleAfterChange: scheduleAfterEvent,
    });
    renderAt("/financiamento");

    fireEvent.click(
      await screen.findByRole("button", { name: "Editar amortização de 15/03/2024" }),
    );
    const form = await edit("15/03/2024");
    expect(within(form).getByLabelText("Data")).toHaveValue("2024-03-15");
    expect(within(form).getByLabelText("Valor")).toHaveValue("12500,50");
    expect(within(form).getByLabelText("Efeito")).toHaveValue("lower_installment");
    fill(form, "Data", "2024-01-20");
    fill(form, "Valor", "13.000,00");
    fill(form, "Efeito", "shorten_term");
    fireEvent.click(within(form).getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(screen.queryByRole("form", { name: /^Editar/ })).toBeNull());
    expect(
      requests
        .filter((req) => req.method === "PUT")
        .map((req) => [new URL(req.url).pathname, req.body]),
    ).toEqual([
      [
        "/api/mortgage/prepayments/2",
        { date: "2024-01-20", amount: "13000.00", effect: "shorten_term" },
      ],
    ]);
    const table = screen.getByRole("table", { name: "Amortizações extraordinárias registradas" });
    expect(rowTexts(table).map((cells) => cells.slice(0, 3))).toEqual([
      ["Data", "Valor", "Efeito"],
      ["20/01/2024", "R$ 13.000,00", "Reduzir prazo"],
      ["20/02/2024", "R$ 5.000,00", "Reduzir prazo"],
      ["02/04/2024", "R$ 1.234,00", "Reduzir prazo"],
    ]);
    const schedule = screen.getByRole("table", { name: "Evolução do financiamento" });
    expect(rowTexts(schedule)[2][10]).toBe("R$ 5.000,00");
  });

  it("keeps the prepayment when the owner cancels", async () => {
    const requests = stubMortgageApi({ mortgage: registeredMortgage, prepayments });
    renderAt("/financiamento");

    fireEvent.click(
      await screen.findByRole("button", { name: "Editar amortização de 15/03/2024" }),
    );
    const form = await edit("15/03/2024");
    fill(form, "Valor", "1,00");
    fireEvent.click(within(form).getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("form", { name: /^Editar/ })).not.toBeInTheDocument();
    expect(screen.getByText("R$ 12.500,50")).toBeInTheDocument();
    expect(requests.some((req) => req.method === "PUT")).toBe(false);
  });

  it("shows the reason next to the field the server rejects", async () => {
    stubMortgageApi({ mortgage: registeredMortgage, prepayments });
    renderAt("/financiamento");

    fireEvent.click(
      await screen.findByRole("button", { name: "Editar amortização de 15/03/2024" }),
    );
    const form = await edit("15/03/2024");
    fill(form, "Valor", "0");
    fireEvent.click(within(form).getByRole("button", { name: "Salvar" }));

    await screen.findByText("Informe um valor maior que zero.");
    expect(within(form).getByLabelText("Valor")).toBeInvalid();
    expect(within(form).getByLabelText("Data")).toBeValid();
  });
});

describe("deleting a prepayment", () => {
  it("asks for confirmation, deletes it and shows the schedule without it", async () => {
    const requests = stubMortgageApi({
      mortgage: registeredMortgage,
      prepayments,
      scheduleAfterChange: schedule,
      schedule: scheduleAfterEvent,
    });
    renderAt("/financiamento");

    fireEvent.click(
      await screen.findByRole("button", { name: "Excluir amortização de 15/03/2024" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Excluir amortização extraordinária?",
    });
    expect(requests.some((req) => req.method === "DELETE")).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Excluir amortização de 15/03/2024" }),
      ).toBeNull(),
    );
    expect(
      requests.filter((req) => req.method === "DELETE").map((req) => new URL(req.url).pathname),
    ).toEqual(["/api/mortgage/prepayments/2"]);
    const table = screen.getByRole("table", { name: "Amortizações extraordinárias registradas" });
    expect(rowTexts(table).map((cells) => cells.slice(0, 3))).toEqual([
      ["Data", "Valor", "Efeito"],
      ["20/02/2024", "R$ 5.000,00", "Reduzir prazo"],
      ["02/04/2024", "R$ 1.234,00", "Reduzir prazo"],
    ]);
    await waitFor(() =>
      expect(
        rowTexts(screen.getByRole("table", { name: "Evolução do financiamento" }))[2][10],
      ).toBe("R$ 0,00"),
    );
  });

  it("keeps the prepayment when the owner cancels", async () => {
    const requests = stubMortgageApi({ mortgage: registeredMortgage, prepayments });
    renderAt("/financiamento");

    fireEvent.click(
      await screen.findByRole("button", { name: "Excluir amortização de 15/03/2024" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(requests.some((req) => req.method === "DELETE")).toBe(false);
    expect(screen.getByText("R$ 12.500,50")).toBeInTheDocument();
  });

  it("says so when the server refuses to delete", async () => {
    stubRoutes({
      "GET /api/mortgage": () => Response.json(registeredMortgage),
      "GET /api/mortgage/schedule": () => Response.json({ installments: [] }),
      "GET /api/mortgage/prepayments": () => Response.json({ prepayments }),
      "GET /api/mortgage/statements": () => Response.json({ statements: [] }),
      "DELETE /api/mortgage/prepayments/:id": () =>
        problem(500, "Internal Server Error", "unexpected failure"),
    });
    renderAt("/financiamento");

    fireEvent.click(
      await screen.findByRole("button", { name: "Excluir amortização de 15/03/2024" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível excluir a amortização extraordinária.",
    );
    expect(screen.getByText("R$ 12.500,50")).toBeInTheDocument();
  });
});

describe("recording a prepayment without choosing an effect", () => {
  it("shortens the term, the first option", async () => {
    const requests = stubMortgageApi({ mortgage: registeredMortgage });
    renderAt("/financiamento");

    const form = await prepaymentForm();
    expect(within(form).getByLabelText("Efeito")).toHaveValue("shorten_term");
    fill(form, "Data", "2024-02-20");
    fill(form, "Valor", "5.000,00");
    fireEvent.click(within(form).getByRole("button", { name: "Registrar" }));

    await within(await region()).findByRole("table");
    expect(bodies(requests, "POST")).toEqual([
      { date: "2024-02-20", amount: "5000.00", effect: "shorten_term" },
    ]);
  });
});

describe("a prepayment the server fails to record", () => {
  it("shows the generic alert and marks no field, even when the problem names one", async () => {
    stubRoutes({
      "GET /api/mortgage": () => Response.json(registeredMortgage),
      "GET /api/mortgage/schedule": () => Response.json({ installments: [] }),
      "GET /api/mortgage/prepayments": () => Response.json({ prepayments: [] }),
      "GET /api/mortgage/statements": () => Response.json({ statements: [] }),
      "POST /api/mortgage/prepayments": () =>
        problem(500, "Internal Server Error", "unexpected failure", [
          { location: "body.amount", message: "boom" },
        ]),
    });
    renderAt("/financiamento");

    const form = await prepaymentForm();
    fill(form, "Data", "2024-02-20");
    fill(form, "Valor", "5.000,00");
    fireEvent.click(within(form).getByRole("button", { name: "Registrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível registrar a amortização extraordinária.",
    );
    expect(within(form).getByLabelText("Data")).toBeValid();
    expect(within(form).getByLabelText("Valor")).toBeValid();
  });
});

describe("editing a prepayment the server fails to save", () => {
  it("shows the generic alert in the form and marks no field", async () => {
    stubRoutes({
      "GET /api/mortgage": () => Response.json(registeredMortgage),
      "GET /api/mortgage/schedule": () => Response.json(schedule),
      "GET /api/mortgage/prepayments": () => Response.json({ prepayments }),
      "GET /api/mortgage/statements": () => Response.json({ statements: [] }),
      "PUT /api/mortgage/prepayments/:id": () =>
        problem(500, "Internal Server Error", "unexpected failure", [
          { location: "body.amount", message: "boom" },
        ]),
    });
    renderAt("/financiamento");

    fireEvent.click(
      await screen.findByRole("button", { name: "Editar amortização de 15/03/2024" }),
    );
    const form = await screen.findByRole("form", { name: "Editar amortização de 15/03/2024" });
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
