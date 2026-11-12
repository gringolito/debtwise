import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rowTexts, text } from "@/test/dom";
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

function fill(form: HTMLElement, label: string, value: string) {
  fireEvent.change(within(form).getByLabelText(label), { target: { value } });
}

function requestsOf(requests: { method: string; url: string; body?: unknown }[], method: string) {
  return requests
    .filter((req) => req.method === method)
    .map((req) => [new URL(req.url).pathname, req.body]);
}

async function openTab() {
  fireEvent.click(await screen.findByRole("radio", { name: "Extratos" }));
}

async function openNewSheet() {
  await openTab();
  fireEvent.click(await screen.findByRole("button", { name: "Registrar extrato" }));
  return screen.findByRole("form", { name: "Registrar extrato" });
}

async function openEditSheet(when: string) {
  await openTab();
  fireEvent.click(await screen.findByRole("button", { name: `Editar extrato de ${when}` }));
  return screen.findByRole("form", { name: `Editar extrato de ${when}` });
}

const statementTable = () => screen.findByRole("table", { name: "Extratos registrados" });
const firstFourCells = async () =>
  rowTexts(await statementTable()).map((cells) => cells.slice(0, 4));

const header = ["Data", "Saldo do banco", "Saldo calculado", "Diferença"];
const fixtureRows = [
  ["10/05/2024", "R$ 10.000,08", "R$ 10.000,00", "R$ 0,08"],
  ["10/04/2024", "R$ 19.500,00", "R$ 20.000,00", "-R$ 500,00"],
  ["20/02/2024", "R$ 41.000,00", "R$ 40.000,00", "R$ 1.000,00"],
];

const stubWithStatementFailing = (route: string, failure: () => Response) =>
  stubRoutes({
    "GET /api/mortgage": () => Response.json(registeredMortgage),
    "GET /api/mortgage/schedule": () => Response.json(schedule),
    "GET /api/mortgage/statements": () => Response.json({ statements }),
    "POST /api/mortgage/statements/preview": () =>
      Response.json({ computed_balance: "20000.00", drift: "-1000.00", within_rounding: false }),
    [route]: failure,
  });

describe("the statements of the mortgage", () => {
  it("lists every statement newest first, marking each drift as rounding or not", async () => {
    stubMortgageApi({ mortgage: registeredMortgage, statements });
    renderAt("/financiamento");

    await openTab();

    expect(await firstFourCells()).toEqual([header, ...fixtureRows]);
    const table = await statementTable();
    expect(
      within(table)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Editar extrato de 10/05/2024",
      "Editar extrato de 10/04/2024",
      "Editar extrato de 20/02/2024",
    ]);
    expect(
      within(table)
        .getAllByRole("img")
        .map((mark) => mark.getAttribute("aria-label")),
    ).toEqual(["Arredondamento", "Acima do arredondamento", "Acima do arredondamento"]);
  });

  it("offers to retry when the statements fail to load", async () => {
    let failing = true;
    stubRoutes({
      "GET /api/mortgage": () => Response.json(registeredMortgage),
      "GET /api/mortgage/schedule": () => Response.json(schedule),
      "GET /api/mortgage/statements": () =>
        failing
          ? problem(500, "Internal Server Error", "unexpected failure")
          : Response.json({ statements }),
    });
    renderAt("/financiamento");
    await openTab();

    const panel = await screen.findByRole("alert");
    expect(within(panel).getByRole("heading")).toHaveTextContent(
      "Não foi possível carregar os extratos",
    );
    failing = false;
    fireEvent.click(within(panel).getByRole("button", { name: "Tentar novamente" }));

    expect(await firstFourCells()).toEqual([header, ...fixtureRows]);
  });

  it("says so when no statement is recorded", async () => {
    stubMortgageApi({ mortgage: registeredMortgage });
    renderAt("/financiamento");

    await openTab();

    expect(await screen.findByText("Nenhum extrato registrado.")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Extratos registrados" })).toBeNull();
  });
});

describe("recording a statement", () => {
  it("shows the calculated balance and the difference, then records it", async () => {
    const requests = stubMortgageApi({
      mortgage: registeredMortgage,
      statements,
      scheduleAfterChange: scheduleAfterEvent,
      statementPreview: () => ({
        computed_balance: "40000.00",
        drift: "0.30",
        within_rounding: true,
      }),
    });
    renderAt("/financiamento");

    const form = await openNewSheet();
    fill(form, "Data do extrato", "21/02/2024");
    fill(form, "Saldo informado", "40.000,30");

    const comparison = await within(form).findByRole("status", {
      name: "Comparação com o saldo calculado",
    });
    expect(text(comparison)).toBe(
      "Saldo calculado R$ 40.000,00 Diferença R$ 0,30 · dentro do esperado",
    );
    expect(requestsOf(requests, "POST")).toEqual([
      ["/api/mortgage/statements/preview", { date: "2024-02-21", outstanding_balance: "40000.30" }],
    ]);
    fireEvent.click(within(form).getByRole("button", { name: "Registrar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(requestsOf(requests, "POST").at(-1)).toEqual([
      "/api/mortgage/statements",
      { date: "2024-02-21", outstanding_balance: "40000.30" },
    ]);
    await waitFor(async () =>
      expect(await firstFourCells()).toEqual([
        header,
        fixtureRows[0],
        fixtureRows[1],
        ["21/02/2024", "R$ 40.000,30", "R$ 0,00", "R$ 40.000,30"],
        fixtureRows[2],
      ]),
    );
  });

  it("says a difference above rounding is more than expected", async () => {
    stubMortgageApi({
      mortgage: registeredMortgage,
      statementPreview: () => ({
        computed_balance: "40000.00",
        drift: "269.35",
        within_rounding: false,
      }),
    });
    renderAt("/financiamento");

    const form = await openNewSheet();
    fill(form, "Data do extrato", "21/02/2024");
    fill(form, "Saldo informado", "40.269,35");

    const comparison = await within(form).findByRole("status");
    expect(text(comparison)).toBe(
      "Saldo calculado R$ 40.000,00 Diferença R$ 269,35 · acima do arredondamento",
    );
  });
});

describe("a statement the server rejects", () => {
  it("says a date already holds a statement before saving", async () => {
    const requests = stubMortgageApi({ mortgage: registeredMortgage, statements });
    renderAt("/financiamento");

    const form = await openNewSheet();
    fill(form, "Data do extrato", "10/04/2024");
    fill(form, "Saldo informado", "19.000,00");

    await within(form).findByText("Já existe um extrato nesta data.");
    expect(within(form).getByLabelText("Data do extrato")).toBeInvalid();
    expect(within(form).getByLabelText("Data do extrato")).toHaveAccessibleDescription(
      "Já existe um extrato nesta data.",
    );
    expect(within(form).getByLabelText("Saldo informado")).toBeValid();
    expect(within(form).queryByRole("status")).toBeNull();
    fireEvent.click(within(form).getByRole("button", { name: "Registrar" }));

    await waitFor(() =>
      expect(requestsOf(requests, "POST").map(([path]) => path)).toContain(
        "/api/mortgage/statements",
      ),
    );
    expect(within(form).getByLabelText("Data do extrato")).toBeInvalid();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await firstFourCells()).toEqual([header, ...fixtureRows]);
  });

  it("says the date is before the contract", async () => {
    stubMortgageApi({ mortgage: registeredMortgage });
    renderAt("/financiamento");

    const form = await openNewSheet();
    fill(form, "Data do extrato", "09/12/2023");
    fill(form, "Saldo informado", "60.000,00");

    expect(
      await within(form).findByText("Não pode ser antes da data do contrato."),
    ).toBeInTheDocument();
    expect(within(form).getByLabelText("Data do extrato")).toBeInvalid();
  });

  it("marks the balance when the server rejects it with a message it does not know", async () => {
    stubWithStatementFailing("POST /api/mortgage/statements/preview", () =>
      problem(422, "Unprocessable Entity", "validation failed", [
        { location: "body.outstanding_balance", message: "must be a decimal number" },
      ]),
    );
    renderAt("/financiamento");

    const form = await openNewSheet();
    fill(form, "Data do extrato", "20/02/2024");
    fill(form, "Saldo informado", "abc");

    await within(form).findByText("Valor inválido.");
    expect(within(form).getByLabelText("Saldo informado")).toBeInvalid();
    expect(within(form).getByLabelText("Data do extrato")).toBeValid();
  });

  it("says it could not record when the failure names no field", async () => {
    stubWithStatementFailing("POST /api/mortgage/statements", () =>
      problem(500, "Internal Server Error", "unexpected failure"),
    );
    renderAt("/financiamento");

    const form = await openNewSheet();
    fill(form, "Data do extrato", "20/02/2024");
    fill(form, "Saldo informado", "41.000,00");
    fireEvent.click(within(form).getByRole("button", { name: "Registrar" }));

    expect(await within(form).findByRole("alert")).toHaveTextContent(
      "Não foi possível registrar o extrato.",
    );
    expect(within(form).getByLabelText("Saldo informado")).toHaveValue("41.000,00");
  });
});

describe("editing a statement", () => {
  it("fills the sheet with the statement and replaces it with what the owner saves", async () => {
    const requests = stubMortgageApi({
      mortgage: registeredMortgage,
      statements,
      scheduleAfterChange: scheduleAfterEvent,
    });
    renderAt("/financiamento");

    const form = await openEditSheet("10/04/2024");
    expect(within(form).getByLabelText("Data do extrato")).toHaveValue("10/04/2024");
    expect(within(form).getByLabelText("Saldo informado")).toHaveValue("19.500,00");
    fill(form, "Data do extrato", "20/01/2024");
    fill(form, "Saldo informado", "52.000,00");
    await waitFor(() =>
      expect(requestsOf(requests, "POST").at(-1)).toEqual([
        "/api/mortgage/statements/preview",
        { date: "2024-01-20", outstanding_balance: "52000.00", replaces: 2 },
      ]),
    );
    fireEvent.click(within(form).getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(requestsOf(requests, "PUT")).toEqual([
      ["/api/mortgage/statements/2", { date: "2024-01-20", outstanding_balance: "52000.00" }],
    ]);
    await waitFor(async () =>
      expect(await firstFourCells()).toEqual([
        header,
        fixtureRows[0],
        fixtureRows[2],
        ["20/01/2024", "R$ 52.000,00", "R$ 0,00", "R$ 52.000,00"],
      ]),
    );
  });

  it("lets a statement keep its own date", async () => {
    stubMortgageApi({ mortgage: registeredMortgage, statements });
    renderAt("/financiamento");

    const form = await openEditSheet("10/04/2024");
    fill(form, "Saldo informado", "19.000,00");
    await within(form).findByRole("status");
    fireEvent.click(within(form).getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText("Já existe um extrato nesta data.")).not.toBeInTheDocument();
  });

  it("says the date is taken when it moves onto another statement's", async () => {
    stubMortgageApi({ mortgage: registeredMortgage, statements });
    renderAt("/financiamento");

    const form = await openEditSheet("10/04/2024");
    fill(form, "Data do extrato", "20/02/2024");
    fireEvent.click(within(form).getByRole("button", { name: "Salvar" }));

    await within(form).findByText("Já existe um extrato nesta data.");
    expect(within(form).getByLabelText("Data do extrato")).toBeInvalid();
  });

  it("keeps the statement when the owner cancels", async () => {
    const requests = stubMortgageApi({ mortgage: registeredMortgage, statements });
    renderAt("/financiamento");

    const form = await openEditSheet("10/04/2024");
    fill(form, "Saldo informado", "1,00");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await firstFourCells()).toEqual([header, ...fixtureRows]);
    expect(requests.some((req) => req.method === "PUT")).toBe(false);
  });

  it("shows the generic alert and marks no field when the server fails to save", async () => {
    stubWithStatementFailing("PUT /api/mortgage/statements/:id", () =>
      problem(500, "Internal Server Error", "unexpected failure", [
        { location: "body.outstanding_balance", message: "boom" },
      ]),
    );
    renderAt("/financiamento");

    const form = await openEditSheet("10/04/2024");
    fill(form, "Saldo informado", "19.000,00");
    fireEvent.click(within(form).getByRole("button", { name: "Salvar" }));

    expect(await within(form).findByRole("alert")).toHaveTextContent(
      "Não foi possível salvar o extrato.",
    );
    expect(within(form).getByLabelText("Data do extrato")).toBeValid();
    expect(within(form).getByLabelText("Saldo informado")).toBeValid();
    expect(within(form).getByLabelText("Saldo informado")).toHaveValue("19.000,00");
  });
});

describe("deleting a statement", () => {
  it("asks for confirmation, deletes it and shows the list without it", async () => {
    const requests = stubMortgageApi({
      mortgage: registeredMortgage,
      statements,
      schedule: scheduleAfterEvent,
      scheduleAfterChange: schedule,
    });
    renderAt("/financiamento");

    await openEditSheet("10/04/2024");
    fireEvent.click(screen.getByRole("button", { name: "Excluir extrato" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Excluir extrato?" });
    expect(requests.some((req) => req.method === "DELETE")).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(requestsOf(requests, "DELETE")).toEqual([["/api/mortgage/statements/2", undefined]]);
    await waitFor(async () =>
      expect(await firstFourCells()).toEqual([header, fixtureRows[0], fixtureRows[2]]),
    );
  });

  it("keeps the statement when the owner cancels", async () => {
    const requests = stubMortgageApi({ mortgage: registeredMortgage, statements });
    renderAt("/financiamento");

    await openEditSheet("10/04/2024");
    fireEvent.click(screen.getByRole("button", { name: "Excluir extrato" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(requests.some((req) => req.method === "DELETE")).toBe(false);
    expect(screen.getByRole("form", { name: "Editar extrato de 10/04/2024" })).toBeVisible();
  });

  it("says so when the server refuses to delete", async () => {
    stubWithStatementFailing("DELETE /api/mortgage/statements/:id", () =>
      problem(500, "Internal Server Error", "unexpected failure"),
    );
    renderAt("/financiamento");

    await openEditSheet("10/04/2024");
    fireEvent.click(screen.getByRole("button", { name: "Excluir extrato" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível excluir o extrato.",
    );
    expect(screen.getByRole("dialog")).toBeVisible();
  });
});
