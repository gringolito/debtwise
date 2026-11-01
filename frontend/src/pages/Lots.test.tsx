import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LotAmount, LotInput, LotValued, LotValues } from "@/lib/api";
import { rowTexts } from "@/test/dom";
import { renderAt } from "@/test/renderAt";
import { problem, stubRoutes } from "@/test/stubServer";

afterEach(() => {
  vi.unstubAllGlobals();
});

function amount(gross: string, iof: string, tax: string, fee: string, net: string): LotAmount {
  return { gross, iof, income_tax: tax, custody_fee: fee, net, projected_by: [] };
}

const ltnValues: LotValues = {
  on: "2026-10-27",
  accrual: amount("2400.10", "12.34", "38.42", "3.90", "2345.44"),
  market: amount("2395.00", "0.00", "37.40", "3.89", "2353.71"),
  maturity: amount("2500.00", "0.00", "48.36", "4.97", "2446.67"),
  coupons: [],
};

const ltn: LotValued = {
  id: 1,
  type: "ltn",
  maturity: "2027-01-01",
  purchase_date: "2026-01-02",
  rate: "0.1276",
  unit_price: "880.50",
  quantity: "2.5",
  values: ltnValues,
};

const ntnb: LotValued = {
  id: 2,
  type: "ntn_b",
  maturity: "2029-05-15",
  purchase_date: "2026-03-10",
  rate: "0.0712",
  unit_price: "4300.00",
  quantity: "1",
  values: {
    on: "2026-10-27",
    accrual: amount("4410.20", "0.00", "17.30", "6.10", "4386.80"),
    maturity: {
      ...amount("4800.40", "0.00", "74.47", "3.21", "4722.72"),
      projected_by: [{ index: "ipca", method: "focus" }],
    },
    coupons: [
      { date: "2026-05-15", paid: true, ...amount("130.12", "0.56", "29.11", "1.75", "98.70") },
      {
        date: "2026-11-15",
        paid: false,
        ...amount("132.40", "0.00", "26.12", "2.30", "103.98"),
        projected_by: [{ index: "ipca", method: "focus" }],
      },
    ],
  },
};

const ntnbPrincipalUnvalued: LotValued = {
  id: 3,
  type: "ntn_b_principal",
  maturity: "2035-05-15",
  purchase_date: "2026-06-01",
  rate: "0.0688",
  unit_price: "2100.00",
  quantity: "3",
  values_unavailable: "missing_ipca",
};

function stubLots(initial: LotValued[]) {
  let lots = initial;
  let nextID = 10;
  return stubRoutes({
    "GET /api/lots": () => Response.json({ lots }),
    "POST /api/lots": (req) => {
      const body = req.body as LotInput;
      if (body.unit_price === "0") {
        return problem(422, "Unprocessable Entity", "validation failed", [
          { location: "body.maturity", message: "must be after the purchase date" },
          { location: "body.unit_price", message: "must be greater than zero" },
        ]);
      }
      const lot = { id: nextID++, ...body };
      lots = [...lots, { ...lot, values: ltnValues }];
      return Response.json(lot, { status: 201 });
    },
    "PUT /api/lots/:id": (req, { id }) => {
      const lot = { id: Number(id), ...(req.body as LotInput) };
      lots = lots.map((l) => (l.id === lot.id ? { ...l, ...lot } : l));
      return Response.json(lot);
    },
    "DELETE /api/lots/:id": (_, { id }) => {
      lots = lots.filter((l) => l.id !== Number(id));
      return new Response(null, { status: 204 });
    },
  });
}

const lotRegion = (name: string) => screen.findByRole("region", { name });
const ltnName = "Tesouro Prefixado 2027 (compra em 02/01/2026)";
const ntnbName = "Tesouro IPCA+ com Juros Semestrais 2029 (compra em 10/03/2026)";
const amountsHeader = ["Valor", "Bruto", "IOF", "IR", "Taxa de custódia", "Líquido", "Projeção"];

function fill(form: HTMLElement, label: string, value: string) {
  fireEvent.change(within(form).getByLabelText(label), { target: { value } });
}

describe("the lots", () => {
  it("shows each lot's values gross, taxed and net, and its coupons", async () => {
    stubLots([ltn, ntnb]);
    renderAt("/lotes");

    const ltnSection = await lotRegion(ltnName);
    expect(
      within(ltnSection).getByText(
        "Vencimento 01/01/2027 · Taxa 12,76% · Preço R$ 880,50 · Quantidade 2,5",
      ),
    ).toBeInTheDocument();
    expect(within(ltnSection).getByText("Valores em 27/10/2026")).toBeInTheDocument();
    expect(
      rowTexts(within(ltnSection).getByRole("table", { name: `Valores de ${ltnName}` })),
    ).toEqual([
      amountsHeader,
      ["Na curva", "R$ 2.400,10", "R$ 12,34", "R$ 38,42", "R$ 3,90", "R$ 2.345,44", "—"],
      ["A mercado", "R$ 2.395,00", "R$ 0,00", "R$ 37,40", "R$ 3,89", "R$ 2.353,71", "—"],
      ["No vencimento", "R$ 2.500,00", "R$ 0,00", "R$ 48,36", "R$ 4,97", "R$ 2.446,67", "—"],
    ]);
    expect(within(ltnSection).queryByRole("table", { name: /^Cupons/ })).toBeNull();

    const ntnbSection = await lotRegion(ntnbName);
    expect(
      rowTexts(within(ntnbSection).getByRole("table", { name: `Valores de ${ntnbName}` })),
    ).toEqual([
      amountsHeader,
      ["Na curva", "R$ 4.410,20", "R$ 0,00", "R$ 17,30", "R$ 6,10", "R$ 4.386,80", "—"],
      ["A mercado", "Sem cotação de venda para este título."],
      [
        "No vencimento",
        "R$ 4.800,40",
        "R$ 0,00",
        "R$ 74,47",
        "R$ 3,21",
        "R$ 4.722,72",
        "ProjetadoIPCA: Mediana do Focus (BCB)",
      ],
    ]);
    expect(
      rowTexts(within(ntnbSection).getByRole("table", { name: `Cupons de ${ntnbName}` })),
    ).toEqual([
      ["Data", "Situação", "Bruto", "IOF", "IR", "Taxa de custódia", "Líquido", "Projeção"],
      ["15/05/2026", "Pago", "R$ 130,12", "R$ 0,56", "R$ 29,11", "R$ 1,75", "R$ 98,70", "—"],
      [
        "15/11/2026",
        "A pagar",
        "R$ 132,40",
        "R$ 0,00",
        "R$ 26,12",
        "R$ 2,30",
        "R$ 103,98",
        "ProjetadoIPCA: Mediana do Focus (BCB)",
      ],
    ]);
  });

  it("says when a lot's values need an IPCA that is neither published nor projected", async () => {
    stubLots([ntnbPrincipalUnvalued]);
    renderAt("/lotes");

    const section = await lotRegion("Tesouro IPCA+ 2035 (compra em 01/06/2026)");
    expect(within(section).getByRole("alert")).toHaveTextContent(
      "Os valores deste lote dependem de um número-índice do IPCA que ainda não foi divulgado nem pode ser projetado.",
    );
    expect(within(section).queryByRole("table")).toBeNull();
  });

  it("says so when no lot is recorded", async () => {
    stubLots([]);
    renderAt("/lotes");

    expect(await screen.findByText("Nenhum lote registrado.")).toBeInTheDocument();
  });
});

describe("recording a lot", () => {
  it("sends what the owner typed and then lists the lot", async () => {
    const requests = stubLots([]);
    renderAt("/lotes");

    const form = await screen.findByRole("form", { name: "Registrar lote" });
    fill(form, "Título", "ntn_f");
    fill(form, "Vencimento", "2031-01-01");
    fill(form, "Data da compra", "2026-10-20");
    fill(form, "Taxa contratada (% ao ano)", "13,52");
    fill(form, "Preço unitário", "912,345678");
    fill(form, "Quantidade", "1,25");
    fireEvent.click(within(form).getByRole("button", { name: "Registrar" }));

    await lotRegion("Tesouro Prefixado com Juros Semestrais 2031 (compra em 20/10/2026)");
    expect(requests.filter((r) => r.method === "POST").map((r) => r.body)).toEqual([
      {
        type: "ntn_f",
        maturity: "2031-01-01",
        purchase_date: "2026-10-20",
        rate: "0.1352",
        unit_price: "912.345678",
        quantity: "1.25",
      },
    ]);
    expect(within(form).getByLabelText("Quantidade")).toHaveValue("");
  });

  it("shows the reason next to each field the server rejects", async () => {
    stubLots([]);
    renderAt("/lotes");

    const form = await screen.findByRole("form", { name: "Registrar lote" });
    fill(form, "Preço unitário", "0");
    fireEvent.click(within(form).getByRole("button", { name: "Registrar" }));

    await within(form).findByText("Informe um preço maior que zero, com até 6 casas decimais.");
    expect(within(form).getByLabelText("Preço unitário")).toBeInvalid();
    expect(within(form).getByLabelText("Vencimento")).toBeInvalid();
    expect(within(form).getByLabelText("Vencimento")).toHaveAccessibleDescription(
      "O vencimento deve ser posterior à compra e cair no dia 1 (Prefixado) ou no dia 15 (IPCA+).",
    );
    expect(within(form).getByLabelText("Quantidade")).toBeValid();
  });
});

describe("editing a lot", () => {
  it("fills the form with the lot and saves what the owner changes", async () => {
    const requests = stubLots([ltn]);
    renderAt("/lotes");

    fireEvent.click(await screen.findByRole("button", { name: `Editar ${ltnName}` }));
    const form = await screen.findByRole("form", { name: `Editar ${ltnName}` });
    expect(within(form).getByLabelText("Título")).toHaveValue("ltn");
    expect(within(form).getByLabelText("Vencimento")).toHaveValue("2027-01-01");
    expect(within(form).getByLabelText("Data da compra")).toHaveValue("2026-01-02");
    expect(within(form).getByLabelText("Taxa contratada (% ao ano)")).toHaveValue("12,76");
    expect(within(form).getByLabelText("Preço unitário")).toHaveValue("880,50");
    expect(within(form).getByLabelText("Quantidade")).toHaveValue("2,5");
    fill(form, "Quantidade", "3");
    fireEvent.click(within(form).getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(screen.queryByRole("form", { name: /^Editar/ })).toBeNull());
    expect(
      requests.filter((r) => r.method === "PUT").map((r) => [new URL(r.url).pathname, r.body]),
    ).toEqual([
      [
        "/api/lots/1",
        {
          type: "ltn",
          maturity: "2027-01-01",
          purchase_date: "2026-01-02",
          rate: "0.1276",
          unit_price: "880.50",
          quantity: "3",
        },
      ],
    ]);
    expect(
      await screen.findByText(
        "Vencimento 01/01/2027 · Taxa 12,76% · Preço R$ 880,50 · Quantidade 3",
      ),
    ).toBeInTheDocument();
  });
});

describe("deleting a lot", () => {
  it("asks for confirmation and then removes the lot", async () => {
    const requests = stubLots([ltn, ntnb]);
    renderAt("/lotes");

    fireEvent.click(await screen.findByRole("button", { name: `Excluir ${ltnName}` }));
    const dialog = await screen.findByRole("alertdialog", { name: "Excluir lote?" });
    expect(requests.some((r) => r.method === "DELETE")).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(screen.queryByRole("region", { name: ltnName })).toBeNull());
    expect(
      requests.filter((r) => r.method === "DELETE").map((r) => new URL(r.url).pathname),
    ).toEqual(["/api/lots/1"]);
    expect(screen.getByRole("region", { name: ntnbName })).toBeInTheDocument();
  });
});

describe("importing lots", () => {
  it("leads to the page that imports a CSV file", async () => {
    stubLots([]);
    renderAt("/lotes");

    expect(
      await screen.findByRole("link", { name: "Importar lotes de um arquivo CSV" }),
    ).toHaveAttribute("href", "/lotes/importar");
  });
});
