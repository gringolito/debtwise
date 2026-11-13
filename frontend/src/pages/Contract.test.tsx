import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RegisteredMortgage } from "@/lib/api";
import { stubMortgageApi } from "@/test/mortgageApi";
import { registeredMortgage, trMortgage } from "@/test/mortgageFixtures";
import { renderAt } from "@/test/renderAt";
import { problem } from "@/test/stubServer";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Before the first installment Financiamento owes the amount financed, so it shows that figure. */
function beforeFirstInstallment() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2023-12-01T12:00:00"));
}

function fill(label: string, value: string, container: HTMLElement = document.body) {
  fireEvent.change(within(container).getByLabelText(label), { target: { value } });
}

function putBodies(requests: { method: string; body?: unknown }[]) {
  return requests.filter((req) => req.method === "PUT").map((req) => req.body);
}

function section(name: string) {
  return screen.getByRole("region", { name });
}

/** The changes a section lists, each by its accessible name, in the order the page shows them. */
function changes(name: string) {
  const list = within(section(name)).queryByRole("list");
  if (!list) return [];
  return within(list)
    .getAllByRole("button")
    .map((row) => row.getAttribute("aria-label")?.replace(/\s/g, " "));
}

function change(name: RegExp) {
  return screen.getByRole("button", { name });
}

/** Opens the sheet of a change listed on the page. */
function openChange(name: RegExp) {
  fireEvent.click(change(name));
  return screen.getByRole("dialog");
}

/** Opens the sheet of a new change from a section's add button. */
function addChange(sectionName: string) {
  fireEvent.click(within(section(sectionName)).getByRole("button", { name: /^Adicionar mudança/ }));
  return screen.getByRole("dialog");
}

function finish(sheet: HTMLElement) {
  fireEvent.click(within(sheet).getByRole("button", { name: "Concluir" }));
}

function cancel(sheet: HTMLElement) {
  fireEvent.click(within(sheet).getByRole("button", { name: "Cancelar" }));
}

function removeChange(name: RegExp) {
  fireEvent.click(within(openChange(name)).getByRole("button", { name: "Remover mudança" }));
}

function save() {
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
}

async function openPage(options: Parameters<typeof stubMortgageApi>[0] = {}) {
  const requests = stubMortgageApi({ mortgage: registeredMortgage, ...options });
  renderAt("/financiamento/editar");
  await screen.findByRole("button", { name: "Salvar" });
  return requests;
}

/** savedPage is Financiamento's key figures, once the page is back. */
async function savedPage() {
  await screen.findByRole("table", { name: "Prestações" });
  return screen.getByText("Saldo devedor").closest("dl") as HTMLElement;
}

// registeredMortgage as the page sends it back when nothing changes.
const registeredTerms = {
  contract_date: "2023-12-10",
  original_amount: "60000.00",
  term_months: 6,
  first_installment_date: "2024-01-10",
  amortization_system: "sac",
  indexer: "none",
  appraisal_value: "100000.00",
  contract_rates: [
    { effective_from: "2023-12-10", rate: "0.12", basis: "nominal", poupanca_additional: false },
  ],
  mip_rates: [
    { effective_from: "2023-12-10", rate: "0.0003" },
    { effective_from: "2024-04-01", rate: "0.0005" },
  ],
  dfi_rates: [{ effective_from: "2023-12-10", rate: "0.0001" }],
  fees: [{ effective_from: "2023-12-10", amount: "12.50" }],
};

const rejected = (errors: NonNullable<Parameters<typeof problem>[3]>) => () =>
  problem(422, "Unprocessable Entity", "validation failed", errors);

const effectiveRate: RegisteredMortgage["contract_rates"] = [
  {
    effective_from: "2023-12-10",
    basis: "effective",
    nominal: "0.1137",
    effective: "0.12",
    poupanca_additional: false,
  },
];

describe("the registered mortgage", () => {
  it("fills every term in and lists each dated change by its start", async () => {
    await openPage();

    expect(screen.getByLabelText("Data do contrato")).toHaveValue("10/12/2023");
    expect(screen.getByLabelText("Valor financiado")).toHaveValue("60.000,00");
    expect(screen.getByLabelText("Prazo")).toHaveValue("6");
    expect(screen.getByLabelText("Primeira prestação")).toHaveValue("10/01/2024");
    expect(screen.getByLabelText("Valor de avaliação")).toHaveValue("100.000,00");
    expect(screen.getByRole("radio", { name: "SAC" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Nenhum" })).toBeChecked();
    expect(changes("Juros do contrato")).toEqual([
      "A partir de 10/12/2023, 12,00 % ao ano · nominal · equivale a 12,682503% efetiva",
    ]);
    expect(changes("Seguros")).toEqual([
      "MIP a partir de 10/12/2023, 0,03 % ao mês",
      "MIP a partir de 01/04/2024, 0,05 % ao mês",
      "DFI a partir de 10/12/2023, 0,01 % ao mês",
    ]);
    expect(changes("Taxas")).toEqual([
      "Taxa de administração a partir de 10/12/2023, R$ 12,50 por mês",
    ]);

    const sheet = openChange(/^A partir de 10\/12\/2023/);
    expect(within(sheet).getByRole("heading", { name: "Mudança de taxa" })).toBeInTheDocument();
    expect(within(sheet).getByLabelText("A partir de")).toHaveValue("10/12/2023");
    expect(within(sheet).getByLabelText("Taxa")).toHaveValue("12");
    expect(within(sheet).getByRole("radio", { name: "Nominal" })).toBeChecked();
    expect(
      within(sheet).getByRole("switch", { name: "Parte vinculada à poupança" }),
    ).not.toBeChecked();
  });

  it("shows the rate the owner informed when it was the effective one", async () => {
    await openPage({ mortgage: { ...registeredMortgage, contract_rates: effectiveRate } });

    expect(changes("Juros do contrato")).toEqual([
      "A partir de 10/12/2023, 12,00 % ao ano · efetiva · equivale a 11,37% nominal",
    ]);
    const sheet = openChange(/^A partir de 10\/12\/2023/);
    expect(within(sheet).getByLabelText("Taxa")).toHaveValue("12");
    expect(within(sheet).getByRole("radio", { name: "Efetiva" })).toBeChecked();
  });

  it("drops the equivalent rate once the owner changes the rate", async () => {
    await openPage({ mortgage: { ...registeredMortgage, contract_rates: effectiveRate } });

    const sheet = openChange(/^A partir de 10\/12\/2023/);
    fill("Taxa", "13", sheet);
    finish(sheet);
    expect(changes("Juros do contrato")).toEqual([
      "A partir de 10/12/2023, 13,00 % ao ano · efetiva",
    ]);
  });

  it("shows the server's equivalent of the saved rate when the contract opens again", async () => {
    const saved: RegisteredMortgage = {
      ...registeredMortgage,
      contract_rates: [{ ...effectiveRate[0], effective: "0.13", nominal: "0.1228" }],
    };
    stubMortgageApi({
      mortgage: { ...registeredMortgage, contract_rates: effectiveRate },
      onSave: () => saved,
    });
    renderAt("/financiamento/editar");
    await screen.findByRole("button", { name: "Salvar" });

    const sheet = openChange(/^A partir de 10\/12\/2023/);
    fill("Taxa", "13", sheet);
    finish(sheet);
    save();
    await savedPage();
    fireEvent.click(screen.getByRole("link", { name: "Editar contrato" }));
    await screen.findByRole("button", { name: "Salvar" });

    expect(changes("Juros do contrato")).toEqual([
      "A partir de 10/12/2023, 13,00 % ao ano · efetiva · equivale a 12,28% nominal",
    ]);
  });

  it("shows a rate with more than two decimal places in full", async () => {
    await openPage({
      mortgage: {
        ...registeredMortgage,
        mip_rates: [{ effective_from: "2023-12-10", rate: "0.000258" }],
      },
    });

    expect(changes("Seguros")).toEqual([
      "MIP a partir de 10/12/2023, 0,0258 % ao mês",
      "DFI a partir de 10/12/2023, 0,01 % ao mês",
    ]);
    expect(within(openChange(/^MIP/)).getByLabelText("Taxa")).toHaveValue("0,0258");
  });

  it("shows rates saved with fewer than two fraction digits as the whole percent they are", async () => {
    await openPage({
      mortgage: {
        ...registeredMortgage,
        contract_rates: [
          {
            effective_from: "2023-12-10",
            basis: "nominal",
            nominal: "0.1",
            effective: "0.104713",
            poupanca_additional: false,
          },
        ],
        mip_rates: [
          { effective_from: "2023-12-10", rate: "0.5" },
          { effective_from: "2024-04-01", rate: "0.05" },
        ],
        dfi_rates: [{ effective_from: "2023-12-10", rate: "1" }],
      },
    });

    expect(changes("Juros do contrato")).toEqual([
      "A partir de 10/12/2023, 10,00 % ao ano · nominal · equivale a 10,4713% efetiva",
    ]);
    expect(changes("Seguros")).toEqual([
      "MIP a partir de 10/12/2023, 50,00 % ao mês",
      "MIP a partir de 01/04/2024, 5,00 % ao mês",
      "DFI a partir de 10/12/2023, 100,00 % ao mês",
    ]);
    expect(within(openChange(/^DFI/)).getByLabelText("Taxa")).toHaveValue("100");
  });
});

describe("saving", () => {
  it("sends the edited terms and returns to Financiamento with the updated figures", async () => {
    const edited: RegisteredMortgage = { ...registeredMortgage, original_amount: "250000.00" };
    const requests = stubMortgageApi({ mortgage: registeredMortgage, onSave: () => edited });
    beforeFirstInstallment();
    renderAt("/financiamento");

    fireEvent.click(await screen.findByRole("link", { name: "Editar contrato" }));
    await screen.findByRole("button", { name: "Salvar" });
    fill("Data do contrato", "11/12/2023");
    fill("Valor financiado", "250.000,00");
    const sheet = openChange(/^MIP a partir de 01\/04\/2024/);
    fill("Taxa", "0,06", sheet);
    finish(sheet);
    expect(changes("Seguros")).toEqual([
      "MIP a partir de 10/12/2023, 0,03 % ao mês",
      "MIP a partir de 01/04/2024, 0,06 % ao mês",
      "DFI a partir de 10/12/2023, 0,01 % ao mês",
    ]);
    save();

    const page = await savedPage();
    expect(within(page).getByText("R$ 250.000,00")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(putBodies(requests)).toEqual([
      {
        ...registeredTerms,
        contract_date: "2023-12-11",
        original_amount: "250000.00",
        mip_rates: [
          { effective_from: "2023-12-10", rate: "0.0003" },
          { effective_from: "2024-04-01", rate: "0.0006" },
        ],
      },
    ]);
  });

  it.each([
    ["6.5", 6.5],
    ["1e2", 100],
  ])("sends a term of %s as the number it reads, not truncated", async (typed, sent) => {
    const requests = await openPage({ onSave: rejected([]) });

    fill("Prazo", typed);
    save();

    await screen.findByRole("alert");
    expect(putBodies(requests)).toEqual([{ ...registeredTerms, term_months: sent }]);
  });

  it.each([
    ["1.250.000,00", "1.250.000,00", "1250000.00"],
    ["1.250.000", "1.250.000,00", "1250000"],
    ["1250000,5", "1.250.000,50", "1250000.5"],
    ["60000.00", "60000.00", "60000.00"],
  ])("shows money typed as %s as %s and sends it as %s", async (typed, shown, sent) => {
    const requests = await openPage({ onSave: rejected([]) });

    fill("Valor financiado", typed);
    expect(screen.getByLabelText("Valor financiado")).toHaveValue(shown);
    save();

    await screen.findByRole("alert");
    expect(putBodies(requests)).toEqual([{ ...registeredTerms, original_amount: sent }]);
  });

  it("groups the thousands of every amount typed, in place and in the sheets", async () => {
    const requests = await openPage({ onSave: () => registeredMortgage });

    fill("Valor de avaliação", "1250000");
    expect(screen.getByLabelText("Valor de avaliação")).toHaveValue("1.250.000,00");
    const sheet = openChange(/^Taxa de administração/);
    fill("Valor", "1250", sheet);
    expect(within(sheet).getByLabelText("Valor")).toHaveValue("1.250,00");
    finish(sheet);
    expect(changes("Taxas")).toEqual([
      "Taxa de administração a partir de 10/12/2023, R$ 1.250,00 por mês",
    ]);
    save();

    await savedPage();
    expect(putBodies(requests)).toEqual([
      {
        ...registeredTerms,
        appraisal_value: "1250000",
        fees: [{ effective_from: "2023-12-10", amount: "1250" }],
      },
    ]);
  });

  it("says plainly that saving failed when the server breaks", async () => {
    await openPage({ onSave: () => problem(500, "Internal Server Error", "unexpected failure") });

    save();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível salvar o contrato.",
    );
    expect(screen.queryByText("Valor inválido.")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled());
  });
});

describe("cancelling", () => {
  it("returns to Financiamento without saving what was typed", async () => {
    beforeFirstInstallment();
    const requests = await openPage();

    fill("Valor financiado", "1,00");
    fireEvent.click(screen.getByRole("link", { name: "Cancelar" }));

    const page = await savedPage();
    expect(within(page).getByText("R$ 60.000,00")).toBeInTheDocument();
    expect(putBodies(requests)).toEqual([]);
  });

  it("leads back to Financiamento from the link above the title", async () => {
    const requests = await openPage();

    fireEvent.click(screen.getByRole("link", { name: "Voltar para Financiamento" }));

    expect(await savedPage()).toBeInTheDocument();
    expect(putBodies(requests)).toEqual([]);
  });

  it("discards what a sheet changed when it is dismissed with Escape", async () => {
    await openPage();

    const sheet = openChange(/^Taxa de administração/);
    fill("Valor", "99,00", sheet);
    fireEvent.keyDown(sheet, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(changes("Taxas")).toEqual([
      "Taxa de administração a partir de 10/12/2023, R$ 12,50 por mês",
    ]);
  });

  it("discards what a sheet changed or added", async () => {
    const requests = await openPage({ onSave: () => registeredMortgage });

    let sheet = openChange(/^Taxa de administração/);
    fill("Valor", "99,00", sheet);
    fill("A partir de", "10/02/2024", sheet);
    cancel(sheet);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    sheet = addChange("Juros do contrato");
    fill("Taxa", "10", sheet);
    cancel(sheet);

    expect(changes("Taxas")).toEqual([
      "Taxa de administração a partir de 10/12/2023, R$ 12,50 por mês",
    ]);
    expect(changes("Juros do contrato")).toEqual([
      "A partir de 10/12/2023, 12,00 % ao ano · nominal · equivale a 12,682503% efetiva",
    ]);
    save();

    await savedPage();
    expect(putBodies(requests)).toEqual([registeredTerms]);
  });
});

describe("the calculation", () => {
  it("offers the amortization systems and sends the one chosen", async () => {
    const requests = await openPage({ onSave: () => registeredMortgage });

    const systems = screen.getByRole("radiogroup", { name: "Sistema de amortização" });
    expect(
      within(systems)
        .getAllByRole("radio")
        .map((radio) => radio.textContent),
    ).toEqual(["SAC", "Price"]);
    fireEvent.click(within(systems).getByRole("radio", { name: "Price" }));
    save();

    await savedPage();
    expect(putBodies(requests)).toEqual([{ ...registeredTerms, amortization_system: "price" }]);
  });

  it("offers the indexers in pt-BR, shows the saved one and sends the one chosen", async () => {
    const edited: RegisteredMortgage = { ...trMortgage, indexer: "ipca" };
    const requests = await openPage({ mortgage: trMortgage, onSave: () => edited });

    const indexers = screen.getByRole("radiogroup", { name: "Correção do saldo" });
    expect(
      within(indexers)
        .getAllByRole("radio")
        .map((radio) => radio.textContent),
    ).toEqual(["TR", "IPCA", "Nenhum"]);
    expect(within(indexers).getByRole("radio", { name: "TR" })).toBeChecked();
    fireEvent.click(within(indexers).getByRole("radio", { name: "IPCA" }));
    save();

    await savedPage();
    expect(putBodies(requests)).toEqual([{ ...registeredTerms, indexer: "ipca" }]);
  });
});

describe("the poupança part of a contract rate", () => {
  it("shows it as declared and sends it back", async () => {
    const requests = await openPage({
      mortgage: {
        ...registeredMortgage,
        contract_rates: [
          {
            effective_from: "2023-12-10",
            basis: "nominal",
            nominal: "0.06",
            effective: "0.0617",
            poupanca_additional: true,
          },
        ],
      },
      onSave: () => registeredMortgage,
    });

    expect(changes("Juros do contrato")).toEqual([
      "A partir de 10/12/2023, 6,00 % ao ano · nominal + poupança · equivale a 6,17% efetiva",
    ]);
    const sheet = openChange(/^A partir de 10\/12\/2023/);
    expect(within(sheet).getByLabelText("Taxa")).toHaveValue("6");
    expect(within(sheet).getByRole("switch", { name: "Parte vinculada à poupança" })).toBeChecked();
    finish(sheet);
    save();

    await savedPage();
    expect(putBodies(requests)).toEqual([
      {
        ...registeredTerms,
        contract_rates: [
          {
            effective_from: "2023-12-10",
            rate: "0.06",
            basis: "nominal",
            poupanca_additional: true,
          },
        ],
      },
    ]);
  });

  it("sends the basis and the poupança part the owner sets", async () => {
    const requests = await openPage({ onSave: () => registeredMortgage });

    const sheet = openChange(/^A partir de 10\/12\/2023/);
    fireEvent.click(within(sheet).getByRole("radio", { name: "Efetiva" }));
    fireEvent.click(within(sheet).getByRole("switch", { name: "Parte vinculada à poupança" }));
    finish(sheet);
    expect(changes("Juros do contrato")).toEqual([
      "A partir de 10/12/2023, 12,00 % ao ano · efetiva + poupança",
    ]);
    save();

    await savedPage();
    expect(putBodies(requests)).toEqual([
      {
        ...registeredTerms,
        contract_rates: [
          {
            effective_from: "2023-12-10",
            rate: "0.12",
            basis: "effective",
            poupanca_additional: true,
          },
        ],
      },
    ]);
  });
});

describe("adding and removing changes", () => {
  it("adds and removes changes of every list, keeping the others as they were", async () => {
    const requests = await openPage({ onSave: () => registeredMortgage });

    removeChange(/^MIP a partir de 10\/12\/2023/);
    removeChange(/^DFI/);
    expect(changes("Seguros")).toEqual(["MIP a partir de 01/04/2024, 0,05 % ao mês"]);

    let sheet = addChange("Juros do contrato");
    expect(
      within(sheet).queryByRole("button", { name: "Remover mudança" }),
    ).not.toBeInTheDocument();
    fill("A partir de", "10/01/2025", sheet);
    fill("Taxa", "10", sheet);
    finish(sheet);

    sheet = addChange("Taxas");
    fill("A partir de", "10/01/2025", sheet);
    fill("Valor", "12,5", sheet);
    finish(sheet);

    sheet = addChange("Seguros");
    expect(within(sheet).getByRole("radio", { name: "MIP" })).toBeChecked();
    fireEvent.click(within(sheet).getByRole("radio", { name: "DFI" }));
    fill("A partir de", "01/02/2024", sheet);
    fill("Taxa", "0,02", sheet);
    finish(sheet);

    expect(changes("Juros do contrato")).toEqual([
      "A partir de 10/12/2023, 12,00 % ao ano · nominal · equivale a 12,682503% efetiva",
      "A partir de 10/01/2025, 10,00 % ao ano · nominal",
    ]);
    expect(changes("Seguros")).toEqual([
      "MIP a partir de 01/04/2024, 0,05 % ao mês",
      "DFI a partir de 01/02/2024, 0,02 % ao mês",
    ]);
    expect(changes("Taxas")).toEqual([
      "Taxa de administração a partir de 10/12/2023, R$ 12,50 por mês",
      "Taxa de administração a partir de 10/01/2025, R$ 12,50 por mês",
    ]);
    save();

    await savedPage();
    expect(putBodies(requests)).toEqual([
      {
        ...registeredTerms,
        contract_rates: [
          ...registeredTerms.contract_rates,
          {
            effective_from: "2025-01-10",
            rate: "0.1",
            basis: "nominal",
            poupanca_additional: false,
          },
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

  it("lists a change by its date wherever it was added, and sends it after the others", async () => {
    const requests = await openPage({ onSave: () => registeredMortgage });

    const sheet = addChange("Seguros");
    fill("A partir de", "01/01/2024", sheet);
    fill("Taxa", "0,04", sheet);
    finish(sheet);

    expect(changes("Seguros")).toEqual([
      "MIP a partir de 10/12/2023, 0,03 % ao mês",
      "MIP a partir de 01/01/2024, 0,04 % ao mês",
      "MIP a partir de 01/04/2024, 0,05 % ao mês",
      "DFI a partir de 10/12/2023, 0,01 % ao mês",
    ]);
    save();

    await savedPage();
    expect(putBodies(requests)).toEqual([
      {
        ...registeredTerms,
        mip_rates: [...registeredTerms.mip_rates, { effective_from: "2024-01-01", rate: "0.0004" }],
      },
    ]);
  });

  it("gives a new contract rate the basis of the latest one", async () => {
    await openPage({ mortgage: { ...registeredMortgage, contract_rates: effectiveRate } });

    const sheet = addChange("Juros do contrato");

    expect(within(sheet).getByRole("radio", { name: "Efetiva" })).toBeChecked();
  });

  it("marks a rejected change by its place in the list, not where its date shows it", async () => {
    await openPage({
      onSave: rejected([{ location: "body.mip_rates[2].rate", message: "is not acceptable" }]),
    });

    let sheet = addChange("Seguros");
    fill("A partir de", "01/01/2024", sheet);
    fill("Taxa", "0,04", sheet);
    finish(sheet);
    save();
    await screen.findByRole("alert");

    const marked = screen
      .getAllByRole("button", { name: /a partir de/i })
      .filter((row) => row.hasAttribute("aria-describedby"));
    expect(marked).toEqual([change(/^MIP a partir de 01\/01\/2024/)]);
    sheet = openChange(/^MIP a partir de 01\/01\/2024/);
    expect(within(sheet).getByLabelText("Taxa")).toHaveAccessibleDescription("Valor inválido.");
  });

  it("lists a change without a date after the dated ones", async () => {
    await openPage();

    const sheet = addChange("Taxas");
    fill("Valor", "1,00", sheet);
    finish(sheet);

    expect(changes("Taxas")).toEqual([
      "Taxa de administração a partir de 10/12/2023, R$ 12,50 por mês",
      "Taxa de administração sem data, R$ 1,00 por mês",
    ]);
  });

  it("sends the remaining changes in order once a middle one is removed", async () => {
    const requests = await openPage({
      mortgage: {
        ...registeredMortgage,
        contract_rates: [
          {
            effective_from: "2023-12-10",
            basis: "nominal",
            nominal: "0.12",
            effective: "0.1268",
            poupanca_additional: false,
          },
          {
            effective_from: "2024-06-10",
            basis: "effective",
            nominal: "0.0957",
            effective: "0.1",
            poupanca_additional: false,
          },
          {
            effective_from: "2025-01-10",
            basis: "nominal",
            nominal: "0.09",
            effective: "0.0938",
            poupanca_additional: false,
          },
        ],
        fees: [
          { effective_from: "2023-12-10", amount: "12.50" },
          { effective_from: "2024-06-10", amount: "15.00" },
          { effective_from: "2025-01-10", amount: "20.00" },
        ],
      },
      onSave: () => registeredMortgage,
    });

    removeChange(/^A partir de 10\/06\/2024/);
    removeChange(/^Taxa de administração a partir de 10\/06\/2024/);

    expect(changes("Juros do contrato")).toEqual([
      "A partir de 10/12/2023, 12,00 % ao ano · nominal · equivale a 12,68% efetiva",
      "A partir de 10/01/2025, 9,00 % ao ano · nominal · equivale a 9,38% efetiva",
    ]);
    expect(changes("Taxas")).toEqual([
      "Taxa de administração a partir de 10/12/2023, R$ 12,50 por mês",
      "Taxa de administração a partir de 10/01/2025, R$ 20,00 por mês",
    ]);
    save();

    await savedPage();
    expect(putBodies(requests)).toEqual([
      {
        ...registeredTerms,
        contract_rates: [
          {
            effective_from: "2023-12-10",
            rate: "0.12",
            basis: "nominal",
            poupanca_additional: false,
          },
          {
            effective_from: "2025-01-10",
            rate: "0.09",
            basis: "nominal",
            poupanca_additional: false,
          },
        ],
        fees: [
          { effective_from: "2023-12-10", amount: "12.50" },
          { effective_from: "2025-01-10", amount: "20.00" },
        ],
      },
    ]);
  });
});

describe("text the API cannot read", () => {
  it("is sent as typed for the API to reject, and an empty term as no number", async () => {
    const requests = await openPage({ onSave: rejected([]) });

    fill("Valor financiado", "muito");
    fill("Prazo", "");
    const sheet = openChange(/^A partir de 10\/12\/2023/);
    fill("Taxa", "alta", sheet);
    finish(sheet);
    expect(changes("Juros do contrato")).toEqual([
      "A partir de 10/12/2023, alta % ao ano · nominal",
    ]);
    save();

    await screen.findByRole("alert");
    expect(putBodies(requests)).toEqual([
      {
        ...registeredTerms,
        original_amount: "muito",
        term_months: null,
        contract_rates: [
          {
            effective_from: "2023-12-10",
            rate: "alta",
            basis: "nominal",
            poupanca_additional: false,
          },
        ],
      },
    ]);
  });
});

describe("a rejected mortgage", () => {
  const rejection = rejected([
    { location: "body.original_amount", message: "expected string to match pattern" },
    {
      location: "body.first_installment_date",
      message: "must not be before the contract date",
      code: "before_contract",
    },
    {
      location: "body.contract_rates",
      message: "needs a row effective on or before the first installment date",
      code: "no_row_from_first_installment",
    },
    // The message is the API's English for its consumers; the code alone picks the owner's words.
    { location: "body.mip_rates[1].rate", message: "reworded by the API", code: "not_positive" },
    {
      location: "body.dfi_rates",
      message: "needs a row effective on or before the first installment date",
      code: "no_row_from_first_installment",
    },
    { location: "body.contract_rates[0].basis", message: "expected value to be one of" },
    {
      location: "body.fees[1].effective_from",
      message: "repeats the date of another row",
      code: "repeated_date",
    },
    { location: "body.something_else", message: "is not known" },
  ]);

  async function submitRejected() {
    const requests = await openPage({ onSave: rejection });
    fill("Valor financiado", "abc");
    const sheet = addChange("Taxas");
    fill("A partir de", "10/12/2023", sheet);
    fill("Valor", "15,00", sheet);
    finish(sheet);
    save();
    await screen.findByRole("alert");
    return requests;
  }

  it("marks each field, change and list the API named with its message in Portuguese", async () => {
    const requests = await submitRejected();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível salvar. Confira os campos destacados.",
    );
    const amount = screen.getByLabelText("Valor financiado");
    expect(amount).toBeInvalid();
    expect(amount).toHaveAccessibleDescription("Valor inválido.");
    expect(amount).toHaveValue("abc");
    expect(screen.getByLabelText("Primeira prestação")).toHaveAccessibleDescription(
      "Não pode ser antes da data do contrato.",
    );
    expect(change(/^A partir de 10\/12\/2023/)).toHaveAccessibleDescription("Valor inválido.");
    expect(change(/^MIP a partir de 01\/04\/2024/)).toHaveAccessibleDescription(
      "Precisa ser maior que zero.",
    );
    expect(change(/^Taxa de administração .*R\$\s15,00/)).toHaveAccessibleDescription(
      "Outra mudança já começa nesta data.",
    );
    expect(
      within(section("Juros do contrato")).getByText(
        "Uma mudança precisa valer desde a primeira prestação.",
      ),
    ).toBeInTheDocument();
    expect(
      within(section("Seguros")).getByText(
        "DFI: Uma mudança precisa valer desde a primeira prestação.",
      ),
    ).toBeInTheDocument();

    for (const label of ["Data do contrato", "Prazo", "Valor de avaliação"]) {
      expect(screen.getByLabelText(label)).toBeValid();
    }
    for (const name of [
      /^MIP a partir de 10\/12\/2023/,
      /^DFI/,
      /^Taxa de administração .*R\$\s12,50/,
    ]) {
      expect(change(name)).not.toHaveAccessibleDescription();
    }
    expect(screen.queryByText(/MIP:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/must|expected|repeats|needs|known/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Valor inválido.")).toHaveLength(2);
    expect(putBodies(requests)).toEqual([
      {
        ...registeredTerms,
        original_amount: "abc",
        fees: [...registeredTerms.fees, { effective_from: "2023-12-10", amount: "15.00" }],
      },
    ]);
  });

  it("marks the field of a change in its sheet", async () => {
    await submitRejected();

    const sheet = openChange(/^MIP a partir de 01\/04\/2024/);

    const rate = within(sheet).getByLabelText("Taxa");
    expect(rate).toBeInvalid();
    expect(rate).toHaveAccessibleDescription("Precisa ser maior que zero.");
    expect(within(sheet).getByLabelText("A partir de")).toBeValid();
  });

  it.each([
    ["removed", () => removeChange(/^MIP a partir de 10\/12\/2023/)],
    ["added", () => finish(addChange("Taxas"))],
  ])("drops the marks once a change is %s, since they pointed at positions", async (_, move) => {
    await submitRejected();

    move();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Valor inválido.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Valor financiado")).toBeValid();
  });

  it("keeps the marks while a change is only edited", async () => {
    await submitRejected();

    const sheet = openChange(/^DFI/);
    fill("Taxa", "0,02", sheet);
    finish(sheet);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("Valor financiado")).toBeInvalid();
  });
});

describe("each location the API can reject", () => {
  const twoEach: RegisteredMortgage = {
    ...registeredMortgage,
    contract_rates: [
      {
        effective_from: "2023-12-10",
        basis: "nominal",
        nominal: "0.12",
        effective: "0.1268",
        poupanca_additional: false,
      },
      {
        effective_from: "2024-06-10",
        basis: "nominal",
        nominal: "0.11",
        effective: "0.1157",
        poupanca_additional: false,
      },
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

  async function rejectAt(location: string) {
    await openPage({
      mortgage: twoEach,
      onSave: rejected([{ location, message: "is not acceptable" }]),
    });
    save();
    await screen.findByRole("alert");
  }

  const markedChanges = () =>
    screen
      .getAllByRole("button", { name: /a partir de/i })
      .filter((row) => row.hasAttribute("aria-describedby"));

  it.each([
    ["body.contract_date", "Data do contrato"],
    ["body.original_amount", "Valor financiado"],
    ["body.term_months", "Prazo"],
    ["body.first_installment_date", "Primeira prestação"],
    ["body.appraisal_value", "Valor de avaliação"],
  ])("marks only the field of %s", async (location, label) => {
    await rejectAt(location);

    expect(screen.getByLabelText(label)).toHaveAccessibleDescription("Valor inválido.");
    expect(screen.getAllByText("Valor inválido.")).toHaveLength(1);
    expect(markedChanges()).toEqual([]);
  });

  it.each([
    ["body.amortization_system", "Sistema de amortização"],
    ["body.indexer", "Correção do saldo"],
  ])("marks only the choice of %s", async (location, name) => {
    await rejectAt(location);

    expect(screen.getByRole("radiogroup", { name })).toHaveAccessibleDescription("Valor inválido.");
    expect(screen.getAllByText("Valor inválido.")).toHaveLength(1);
    expect(markedChanges()).toEqual([]);
  });

  it.each([
    ["body.contract_rates[1].effective_from", /^A partir de 10\/06\/2024/, "A partir de"],
    ["body.contract_rates[1].rate", /^A partir de 10\/06\/2024/, "Taxa"],
    ["body.mip_rates[1].effective_from", /^MIP a partir de 01\/04\/2024/, "A partir de"],
    ["body.mip_rates[1].rate", /^MIP a partir de 01\/04\/2024/, "Taxa"],
    ["body.dfi_rates[1].effective_from", /^DFI a partir de 01\/04\/2024/, "A partir de"],
    ["body.dfi_rates[1].rate", /^DFI a partir de 01\/04\/2024/, "Taxa"],
    ["body.fees[1].effective_from", /^Taxa de administração a partir de 01\/04/, "A partir de"],
    ["body.fees[1].amount", /^Taxa de administração a partir de 01\/04/, "Valor"],
  ])("marks only the change of %s, and its field in the sheet", async (location, row, field) => {
    await rejectAt(location);

    expect(markedChanges()).toEqual([change(row)]);
    expect(change(row)).toHaveAccessibleDescription("Valor inválido.");
    const sheet = openChange(row);
    expect(within(sheet).getByLabelText(field)).toHaveAccessibleDescription("Valor inválido.");
    expect(within(sheet).getAllByText("Valor inválido.")).toHaveLength(1);
  });

  it.each([
    [
      "body.contract_rates[1].basis",
      (sheet: HTMLElement) => within(sheet).getByRole("radiogroup", { name: "Base" }),
    ],
    [
      "body.contract_rates[1].poupanca_additional",
      (sheet: HTMLElement) =>
        within(sheet).getByRole("switch", { name: "Parte vinculada à poupança" }),
    ],
  ])("marks %s in the sheet of its contract rate", async (location, control) => {
    await rejectAt(location);

    const sheet = openChange(/^A partir de 10\/06\/2024/);

    expect(control(sheet)).toHaveAccessibleDescription("Valor inválido.");
    expect(within(sheet).getAllByText("Valor inválido.")).toHaveLength(1);
  });

  it("tells each message of a change once", async () => {
    await openPage({
      mortgage: twoEach,
      onSave: rejected([
        { location: "body.fees[1].effective_from", message: "is not acceptable" },
        { location: "body.fees[1].amount", message: "is not acceptable" },
      ]),
    });
    save();
    await screen.findByRole("alert");

    expect(markedChanges()).toEqual([change(/^Taxa de administração a partir de 01\/04/)]);
    expect(change(/^Taxa de administração a partir de 01\/04/)).toHaveAccessibleDescription(
      "Valor inválido.",
    );
  });

  it.each([
    ["body.contract_rates", "Juros do contrato", "Valor inválido."],
    ["body.mip_rates", "Seguros", "MIP: Valor inválido."],
    ["body.dfi_rates", "Seguros", "DFI: Valor inválido."],
    ["body.fees", "Taxas", "Valor inválido."],
  ])("marks only the list of %s", async (location, sectionName, message) => {
    await rejectAt(location);

    expect(within(section(sectionName)).getByText(message)).toBeInTheDocument();
    expect(screen.getAllByText(/Valor inválido\./)).toHaveLength(1);
    expect(markedChanges()).toEqual([]);
  });
});

describe("the insurance charged on the first installment", () => {
  it("fills the DFI rate with the one that charges the value typed on the appraisal value", async () => {
    const requests = await openPage({ onSave: () => registeredMortgage });

    const sheet = openChange(/^DFI/);
    fill("Valor na primeira prestação", "33,50", sheet);
    expect(within(sheet).getByLabelText("Taxa")).toHaveValue("0,0335");
    finish(sheet);
    save();

    await savedPage();
    expect(putBodies(requests)).toEqual([
      { ...registeredTerms, dfi_rates: [{ effective_from: "2023-12-10", rate: "0.000335" }] },
    ]);
  });

  it("fills the MIP rate in force at the first installment from the value typed on the original amount", async () => {
    const requests = await openPage({ onSave: () => registeredMortgage });

    let sheet = openChange(/^MIP a partir de 01\/04\/2024/);
    expect(within(sheet).queryByLabelText("Valor na primeira prestação")).not.toBeInTheDocument();
    cancel(sheet);
    sheet = openChange(/^MIP a partir de 10\/12\/2023/);
    fill("Valor na primeira prestação", "15,48", sheet);
    expect(within(sheet).getByLabelText("Taxa")).toHaveValue("0,0258");
    finish(sheet);

    expect(changes("Seguros")).toEqual([
      "MIP a partir de 10/12/2023, 0,0258 % ao mês",
      "MIP a partir de 01/04/2024, 0,05 % ao mês",
      "DFI a partir de 10/12/2023, 0,01 % ao mês",
    ]);
    save();

    await savedPage();
    expect(putBodies(requests)).toEqual([
      {
        ...registeredTerms,
        mip_rates: [
          { effective_from: "2023-12-10", rate: "0.000258" },
          { effective_from: "2024-04-01", rate: "0.0005" },
        ],
      },
    ]);
  });

  it("moves the value and its rate to the change that a later first installment falls in", async () => {
    const requests = await openPage({ onSave: () => registeredMortgage });

    let sheet = openChange(/^MIP a partir de 10\/12\/2023/);
    fill("Valor na primeira prestação", "15,48", sheet);
    finish(sheet);
    fill("Primeira prestação", "10/04/2024");

    expect(changes("Seguros")).toEqual([
      "MIP a partir de 10/12/2023, 0,0258 % ao mês",
      "MIP a partir de 01/04/2024, 0,0258 % ao mês",
      "DFI a partir de 10/12/2023, 0,01 % ao mês",
    ]);
    sheet = openChange(/^MIP a partir de 10\/12\/2023/);
    expect(within(sheet).queryByLabelText("Valor na primeira prestação")).not.toBeInTheDocument();
    cancel(sheet);
    sheet = openChange(/^MIP a partir de 01\/04\/2024/);
    const value = within(sheet).getByLabelText("Valor na primeira prestação");
    expect(value).toHaveValue("15,48");
    fireEvent.change(value, { target: { value: "25,80" } });
    expect(within(sheet).getByLabelText("Taxa")).toHaveValue("0,043");
    finish(sheet);
    save();

    await savedPage();
    expect(putBodies(requests)).toEqual([
      {
        ...registeredTerms,
        first_installment_date: "2024-04-10",
        mip_rates: [
          { effective_from: "2023-12-10", rate: "0.000258" },
          { effective_from: "2024-04-01", rate: "0.00043" },
        ],
      },
    ]);
  });

  it.each([
    [
      "has the fewest decimal places, though another is nearer value / base",
      "123.456,78",
      "37,04",
      "0,03",
    ],
    [
      "is the nearest value / base of several with as few places",
      "250.000,00",
      "52,49",
      "0,020996",
    ],
    ["may charge half a centavo less, which rounds up", "135.000,00", "10,13", "0,0075"],
    [
      "never charges half a centavo more, which rounds up past it",
      "135.000,00",
      "10,12",
      "0,007496",
    ],
  ])("fills a rate that %s", async (_, appraisal, charge, rate) => {
    await openPage();

    fill("Valor de avaliação", appraisal);
    const sheet = openChange(/^DFI/);
    fill("Valor na primeira prestação", charge, sheet);

    expect(within(sheet).getByLabelText("Taxa")).toHaveValue(rate);
  });

  it("says each value needs the amount it is charged on, and fills the rate once it is there", async () => {
    await openPage();

    fill("Valor financiado", "");
    fill("Valor de avaliação", "");
    let sheet = openChange(/^MIP a partir de 10\/12\/2023/);
    let value = within(sheet).getByLabelText("Valor na primeira prestação");
    expect(value).toHaveAccessibleDescription("Preencha o valor financiado para calcular a taxa.");
    fireEvent.change(value, { target: { value: "15,48" } });
    expect(within(sheet).getByLabelText("Taxa")).toHaveValue("0,03");
    finish(sheet);
    sheet = openChange(/^DFI/);
    value = within(sheet).getByLabelText("Valor na primeira prestação");
    expect(value).toHaveAccessibleDescription(
      "Preencha o valor de avaliação para calcular a taxa.",
    );
    fireEvent.change(value, { target: { value: "33,50" } });
    expect(within(sheet).getByLabelText("Taxa")).toHaveValue("0,01");
    finish(sheet);

    fill("Valor financiado", "60.000,00");
    fill("Valor de avaliação", "100.000,00");
    expect(changes("Seguros")).toEqual([
      "MIP a partir de 10/12/2023, 0,0258 % ao mês",
      "MIP a partir de 01/04/2024, 0,05 % ao mês",
      "DFI a partir de 10/12/2023, 0,0335 % ao mês",
    ]);
    sheet = openChange(/^DFI/);
    expect(within(sheet).getByLabelText("Valor na primeira prestação")).toHaveAccessibleDescription(
      "Para calcular a taxa.",
    );
  });

  it("saves the rate the owner types over the derived one, dropping the value it no longer charges", async () => {
    const requests = await openPage({ onSave: () => registeredMortgage });

    let sheet = openChange(/^DFI/);
    fill("Valor na primeira prestação", "33,50", sheet);
    fill("Taxa", "0,034", sheet);
    expect(within(sheet).getByLabelText("Valor na primeira prestação")).toHaveValue("");
    finish(sheet);
    fill("Valor de avaliação", "120.000,00");

    expect(changes("Seguros")).toContain("DFI a partir de 10/12/2023, 0,034 % ao mês");
    sheet = openChange(/^DFI/);
    expect(within(sheet).getByLabelText("Valor na primeira prestação")).toHaveValue("");
    finish(sheet);
    save();

    await savedPage();
    expect(putBodies(requests)).toEqual([
      {
        ...registeredTerms,
        appraisal_value: "120000.00",
        dfi_rates: [{ effective_from: "2023-12-10", rate: "0.00034" }],
      },
    ]);
  });

  it("marks a value that isn't whole centavos and keeps the rate", async () => {
    await openPage();

    const sheet = openChange(/^DFI/);
    fill("Valor na primeira prestação", "33,505", sheet);

    const value = within(sheet).getByLabelText("Valor na primeira prestação");
    expect(value).toBeInvalid();
    expect(value).toHaveAccessibleDescription("Valor inválido.");
    expect(within(sheet).getByLabelText("Taxa")).toHaveValue("0,01");
    finish(sheet);
    expect(screen.getByRole("dialog")).toBe(sheet);

    fill("Valor na primeira prestação", "33,50", sheet);
    finish(sheet);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(changes("Seguros")).toContain("DFI a partir de 10/12/2023, 0,0335 % ao mês");
  });
});
