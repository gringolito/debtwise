import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rowTexts } from "@/test/dom";
import { stubMortgageApi } from "@/test/mortgageApi";
import {
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

const region = () => screen.findByRole("region", { name: "Extratos" });
const statementForm = () => screen.findByRole("form", { name: "Registrar extrato" });
const statementTable = () => screen.findByRole("table", { name: "Extratos registrados" });

function fill(form: HTMLElement, label: string, value: string) {
  fireEvent.change(within(form).getByLabelText(label), { target: { value } });
}

function requestsOf(requests: { method: string; url: string; body?: unknown }[], method: string) {
  return requests
    .filter((req) => req.method === method)
    .map((req) => [new URL(req.url).pathname, req.body]);
}

const fixtureRows = [
  ["Data", "Saldo informado", "Saldo calculado", "Diferença"],
  ["20/02/2024", "R$ 41.000,00", "R$ 40.000,00", "R$ 1.000,00"],
  ["10/04/2024", "R$ 19.500,00", "R$ 20.000,00", "-R$ 500,00"],
  ["10/05/2024", "R$ 10.000,00", "R$ 10.000,00", "R$ 0,00"],
];

const firstFourCells = (table: HTMLElement) => rowTexts(table).map((cells) => cells.slice(0, 4));

describe("the statements of the mortgage", () => {
  it("lists every statement with its computed balance and drift", async () => {
    stubMortgageApi({ mortgage: registeredMortgage, statements });

    renderAt("/financiamento");

    const table = await within(await region()).findByRole("table");
    expect(firstFourCells(table)).toEqual(fixtureRows);
    expect(
      within(table)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Editar extrato de 20/02/2024",
      "Excluir extrato de 20/02/2024",
      "Editar extrato de 10/04/2024",
      "Excluir extrato de 10/04/2024",
      "Editar extrato de 10/05/2024",
      "Excluir extrato de 10/05/2024",
    ]);
  });

  it("says so when no statement is recorded", async () => {
    stubMortgageApi({ mortgage: registeredMortgage });

    renderAt("/financiamento");

    const section = await region();
    expect(await within(section).findByText("Nenhum extrato registrado.")).toBeInTheDocument();
    expect(within(section).queryByRole("table")).not.toBeInTheDocument();
  });

  it("records a statement and then shows it and the schedule that continues from it", async () => {
    const requests = stubMortgageApi({
      mortgage: registeredMortgage,
      scheduleAfterChange: scheduleAfterEvent,
    });
    renderAt("/financiamento");

    const form = await statementForm();
    fill(form, "Data", "2024-02-20");
    fill(form, "Saldo informado", "41.000,00");
    fireEvent.click(within(form).getByRole("button", { name: "Registrar" }));

    expect(firstFourCells(await statementTable())).toEqual([
      fixtureRows[0],
      ["20/02/2024", "R$ 41.000,00", "R$ 0,00", "R$ 41.000,00"],
    ]);
    expect(requestsOf(requests, "POST")).toEqual([
      ["/api/mortgage/statements", { date: "2024-02-20", outstanding_balance: "41000.00" }],
    ]);
    const scheduleTable = screen.getByRole("table", { name: "Evolução do financiamento" });
    expect(rowTexts(scheduleTable)[2][12]).toBe("R$ 35.000,00");
    expect(within(form).getByLabelText("Saldo informado")).toHaveValue("");
  });
});

describe("a statement the server rejects", () => {
  it("says a date already holds a statement", async () => {
    stubMortgageApi({ mortgage: registeredMortgage, statements });
    renderAt("/financiamento");

    const form = await statementForm();
    fill(form, "Data", "2024-04-10");
    fill(form, "Saldo informado", "19.000,00");
    fireEvent.click(within(form).getByRole("button", { name: "Registrar" }));

    await screen.findByText("Já existe um extrato nesta data.");
    expect(within(form).getByLabelText("Data")).toBeInvalid();
    expect(within(form).getByLabelText("Data")).toHaveAccessibleDescription(
      "Já existe um extrato nesta data.",
    );
    expect(within(form).getByLabelText("Saldo informado")).toBeValid();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(firstFourCells(await statementTable())).toEqual(fixtureRows);
  });

  it("says the date is before the contract", async () => {
    stubMortgageApi({ mortgage: registeredMortgage });
    renderAt("/financiamento");

    const form = await statementForm();
    fill(form, "Data", "2023-12-09");
    fill(form, "Saldo informado", "60.000,00");
    fireEvent.click(within(form).getByRole("button", { name: "Registrar" }));

    expect(
      await screen.findByText("A data não pode ser anterior à data do contrato."),
    ).toBeInTheDocument();
    expect(within(form).getByLabelText("Data")).toBeInvalid();
  });

  it("marks the balance when the server rejects it with a message it does not know", async () => {
    stubRoutes({
      "GET /api/mortgage": () => Response.json(registeredMortgage),
      "GET /api/mortgage/schedule": () => Response.json(schedule),
      "GET /api/mortgage/prepayments": () => Response.json({ prepayments: [] }),
      "GET /api/mortgage/statements": () => Response.json({ statements: [] }),
      "POST /api/mortgage/statements": () =>
        problem(422, "Unprocessable Entity", "validation failed", [
          { location: "body.outstanding_balance", message: "must be a decimal number" },
        ]),
    });
    renderAt("/financiamento");

    const form = await statementForm();
    fill(form, "Data", "2024-02-20");
    fill(form, "Saldo informado", "abc");
    fireEvent.click(within(form).getByRole("button", { name: "Registrar" }));

    await screen.findByText("Valor inválido.");
    expect(within(form).getByLabelText("Saldo informado")).toBeInvalid();
    expect(within(form).getByLabelText("Data")).toBeValid();
  });

  it("says it could not record when the failure names no field", async () => {
    stubRoutes({
      "GET /api/mortgage": () => Response.json(registeredMortgage),
      "GET /api/mortgage/schedule": () => Response.json(schedule),
      "GET /api/mortgage/prepayments": () => Response.json({ prepayments: [] }),
      "GET /api/mortgage/statements": () => Response.json({ statements: [] }),
      "POST /api/mortgage/statements": () =>
        problem(500, "Internal Server Error", "unexpected failure"),
    });
    renderAt("/financiamento");

    const form = await statementForm();
    fill(form, "Data", "2024-02-20");
    fill(form, "Saldo informado", "41.000,00");
    fireEvent.click(within(form).getByRole("button", { name: "Registrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível registrar o extrato.",
    );
    expect(within(form).getByLabelText("Saldo informado")).toHaveValue("41.000,00");
  });
});

describe("editing a statement", () => {
  const edit = (when: string) => screen.findByRole("form", { name: `Editar extrato de ${when}` });

  it("fills the form with the statement and replaces it with what the owner saves", async () => {
    const requests = stubMortgageApi({
      mortgage: registeredMortgage,
      statements,
      scheduleAfterChange: scheduleAfterEvent,
    });
    renderAt("/financiamento");

    fireEvent.click(await screen.findByRole("button", { name: "Editar extrato de 10/04/2024" }));
    const form = await edit("10/04/2024");
    expect(within(form).getByLabelText("Data")).toHaveValue("2024-04-10");
    expect(within(form).getByLabelText("Saldo informado")).toHaveValue("19500,00");
    fill(form, "Data", "2024-01-20");
    fill(form, "Saldo informado", "52.000,00");
    fireEvent.click(within(form).getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(screen.queryByRole("form", { name: /^Editar/ })).toBeNull());
    expect(requestsOf(requests, "PUT")).toEqual([
      ["/api/mortgage/statements/2", { date: "2024-01-20", outstanding_balance: "52000.00" }],
    ]);
    expect(firstFourCells(await statementTable())).toEqual([
      fixtureRows[0],
      ["20/01/2024", "R$ 52.000,00", "R$ 0,00", "R$ 52.000,00"],
      fixtureRows[1],
      fixtureRows[3],
    ]);
    const scheduleTable = screen.getByRole("table", { name: "Evolução do financiamento" });
    await waitFor(() => expect(rowTexts(scheduleTable)[2][12]).toBe("R$ 35.000,00"));
  });

  it("lets a statement keep its own date", async () => {
    stubMortgageApi({ mortgage: registeredMortgage, statements });
    renderAt("/financiamento");

    fireEvent.click(await screen.findByRole("button", { name: "Editar extrato de 10/04/2024" }));
    const form = await edit("10/04/2024");
    fill(form, "Saldo informado", "19.000,00");
    fireEvent.click(within(form).getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(screen.queryByRole("form", { name: /^Editar/ })).toBeNull());
    expect(screen.queryByText("Já existe um extrato nesta data.")).not.toBeInTheDocument();
  });

  it("says the date is taken when it moves onto another statement's", async () => {
    stubMortgageApi({ mortgage: registeredMortgage, statements });
    renderAt("/financiamento");

    fireEvent.click(await screen.findByRole("button", { name: "Editar extrato de 10/04/2024" }));
    const form = await edit("10/04/2024");
    fill(form, "Data", "2024-02-20");
    fireEvent.click(within(form).getByRole("button", { name: "Salvar" }));

    await screen.findByText("Já existe um extrato nesta data.");
    expect(within(form).getByLabelText("Data")).toBeInvalid();
  });

  it("keeps the statement when the owner cancels", async () => {
    const requests = stubMortgageApi({ mortgage: registeredMortgage, statements });
    renderAt("/financiamento");

    fireEvent.click(await screen.findByRole("button", { name: "Editar extrato de 10/04/2024" }));
    const form = await edit("10/04/2024");
    fill(form, "Saldo informado", "1,00");
    fireEvent.click(within(form).getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("form", { name: /^Editar/ })).not.toBeInTheDocument();
    expect(firstFourCells(await statementTable())).toEqual(fixtureRows);
    expect(requests.some((req) => req.method === "PUT")).toBe(false);
  });
});

describe("deleting a statement", () => {
  it("asks for confirmation, deletes it and shows the schedule without it", async () => {
    const requests = stubMortgageApi({
      mortgage: registeredMortgage,
      statements,
      schedule: scheduleAfterEvent,
      scheduleAfterChange: schedule,
    });
    renderAt("/financiamento");

    fireEvent.click(await screen.findByRole("button", { name: "Excluir extrato de 10/04/2024" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Excluir extrato?" });
    expect(requests.some((req) => req.method === "DELETE")).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Excluir extrato de 10/04/2024" })).toBeNull(),
    );
    expect(requestsOf(requests, "DELETE")).toEqual([["/api/mortgage/statements/2", undefined]]);
    expect(firstFourCells(await statementTable())).toEqual([
      fixtureRows[0],
      fixtureRows[1],
      fixtureRows[3],
    ]);
    const scheduleTable = screen.getByRole("table", { name: "Evolução do financiamento" });
    await waitFor(() => expect(rowTexts(scheduleTable)[2][12]).toBe("R$ 40.000,00"));
  });

  it("keeps the statement when the owner cancels", async () => {
    const requests = stubMortgageApi({ mortgage: registeredMortgage, statements });
    renderAt("/financiamento");

    fireEvent.click(await screen.findByRole("button", { name: "Excluir extrato de 10/04/2024" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(requests.some((req) => req.method === "DELETE")).toBe(false);
    expect(firstFourCells(await statementTable())).toEqual(fixtureRows);
  });

  it("says so when the server refuses to delete", async () => {
    stubRoutes({
      "GET /api/mortgage": () => Response.json(registeredMortgage),
      "GET /api/mortgage/schedule": () => Response.json(schedule),
      "GET /api/mortgage/prepayments": () => Response.json({ prepayments: [] }),
      "GET /api/mortgage/statements": () => Response.json({ statements }),
      "DELETE /api/mortgage/statements/:id": () =>
        problem(500, "Internal Server Error", "unexpected failure"),
    });
    renderAt("/financiamento");

    fireEvent.click(await screen.findByRole("button", { name: "Excluir extrato de 10/04/2024" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível excluir o extrato.",
    );
    expect(firstFourCells(await statementTable())).toEqual(fixtureRows);
  });
});

describe("editing a statement the server fails to save", () => {
  it("shows the generic alert in the form and marks no field", async () => {
    stubRoutes({
      "GET /api/mortgage": () => Response.json(registeredMortgage),
      "GET /api/mortgage/schedule": () => Response.json(schedule),
      "GET /api/mortgage/prepayments": () => Response.json({ prepayments: [] }),
      "GET /api/mortgage/statements": () => Response.json({ statements }),
      "PUT /api/mortgage/statements/:id": () =>
        problem(500, "Internal Server Error", "unexpected failure", [
          { location: "body.outstanding_balance", message: "boom" },
        ]),
    });
    renderAt("/financiamento");

    fireEvent.click(await screen.findByRole("button", { name: "Editar extrato de 10/04/2024" }));
    const form = await screen.findByRole("form", { name: "Editar extrato de 10/04/2024" });
    fill(form, "Saldo informado", "19.000,00");
    fireEvent.click(within(form).getByRole("button", { name: "Salvar" }));

    expect(await within(form).findByRole("alert")).toHaveTextContent(
      "Não foi possível salvar o extrato.",
    );
    expect(within(form).getByLabelText("Data")).toBeValid();
    expect(within(form).getByLabelText("Saldo informado")).toBeValid();
    expect(within(form).getByLabelText("Saldo informado")).toHaveValue("19.000,00");
  });
});
