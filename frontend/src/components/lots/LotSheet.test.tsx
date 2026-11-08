import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LotSheet } from "@/components/lots/LotSheet";
import type { BondQuote, Lot, LotInput } from "@/lib/api";
import { type RecordedRequest, problem, stubRoutes } from "@/test/stubServer";

afterEach(() => {
  vi.unstubAllGlobals();
});

const catalogue: BondQuote[] = (
  [
    ["ltn", "2029-01-01"],
    ["ntn_b_principal", "2035-05-15"],
  ] as const
).map(([type, maturity]) => ({
  type,
  maturity,
  sell: { rate: "0.1", unit_price: "1000" },
  fetched_at: "2026-10-27T09:00:00Z",
}));

const ltn: Lot = {
  id: 1,
  type: "ltn",
  maturity: "2027-01-01",
  purchase_date: "2026-01-02",
  rate: "0.1276",
  unit_price: "880.50",
  quantity: "2.5",
};

const saved: Lot = {
  id: 7,
  type: "ntn_b_principal",
  maturity: "2035-05-15",
  purchase_date: "2024-05-12",
  rate: "0.0621",
  unit_price: "2012.34",
  quantity: "8",
};

function renderSheet(lot?: Lot) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <LotSheet lot={lot} onClose={onClose} onSaved={onSaved} />
    </QueryClientProvider>,
  );
  return { onClose, onSaved };
}

const sent = (requests: RecordedRequest[], method: string, pathname: string) =>
  requests
    .filter((r) => r.method === method && new URL(r.url).pathname === pathname)
    .map((r) => r.body);

const openForm = (name: string) => screen.findByRole("form", { name });

function fill(form: HTMLElement, label: string, value: string) {
  fireEvent.change(within(form).getByLabelText(label), { target: { value } });
}

async function pickBond(form: HTMLElement, option: string, value: string) {
  await within(form).findByRole("option", { name: option });
  fill(form, "Título", value);
}

function fillPurchase(form: HTMLElement) {
  fill(form, "Data da compra", "2024-05-12");
  fill(form, "Taxa", "6,21");
  fill(form, "Preço unitário", "2.012,34");
  fill(form, "Quantidade", "8");
}

describe("adding a purchase", () => {
  it("sends what the owner typed, with the picked bond's type and maturity", async () => {
    const requests = stubRoutes({
      "GET /api/bonds": () => Response.json({ bonds: catalogue }),
      "POST /api/lots/preview": () => Response.json({ cost: "16098.72" }),
      "POST /api/lots": () => Response.json(saved, { status: 201 }),
    });
    const { onClose, onSaved } = renderSheet();

    const form = await openForm("Adicionar compra");
    expect(within(form).getByLabelText("Título")).toHaveDisplayValue("Escolha");
    await pickBond(form, "Tesouro IPCA+ 2035", "ntn_b_principal 2035-05-15");
    fillPurchase(form);
    expect(within(form).getByText("IPCA +")).toBeInTheDocument();
    fill(form, "Quantidade", "1250");
    expect(within(form).getByLabelText("Quantidade")).toHaveValue("1.250");
    fill(form, "Quantidade", "8");
    fireEvent.click(within(form).getByRole("button", { name: "Adicionar" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(sent(requests, "POST", "/api/lots")).toEqual([
      {
        type: "ntn_b_principal",
        maturity: "2035-05-15",
        purchase_date: "2024-05-12",
        rate: "0.0621",
        unit_price: "2012.34",
        quantity: "8",
      },
    ]);
  });

  it("offers every catalogue bond, and no IPCA prefix on a prefixed one", async () => {
    stubRoutes({ "GET /api/bonds": () => Response.json({ bonds: catalogue }) });
    renderSheet();

    const form = await openForm("Adicionar compra");
    await pickBond(form, "Tesouro Prefixado 2029", "ltn 2029-01-01");

    const options = within(within(form).getByLabelText("Título")).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Tesouro Prefixado 2029",
      "Tesouro IPCA+ 2035",
      "Outro título",
    ]);
    expect(within(form).queryByText("IPCA +")).toBeNull();
  });

  it("records a bond the catalogue lacks through Outro título, even when it fails to load", async () => {
    const requests = stubRoutes({
      "GET /api/bonds": () => problem(500, "Internal Server Error", "boom"),
      "POST /api/lots/preview": () => Response.json({ cost: "1140.00" }),
      "POST /api/lots": () => Response.json(saved, { status: 201 }),
    });
    renderSheet();

    const form = await openForm("Adicionar compra");
    expect(within(form).queryByLabelText("Vencimento")).toBeNull();
    fill(form, "Título", "other");
    fill(form, "Tipo", "ntn_f");
    fill(form, "Vencimento", "2031-01-01");
    fill(form, "Data da compra", "2026-10-20");
    fill(form, "Taxa", "13,52");
    fill(form, "Preço unitário", "912,345678");
    fill(form, "Quantidade", "1,25");
    expect(within(form).getByLabelText("Título")).toHaveDisplayValue("Outro título");
    fireEvent.click(within(form).getByRole("button", { name: "Adicionar" }));

    await waitFor(() => expect(sent(requests, "POST", "/api/lots")).toHaveLength(1));
    expect(sent(requests, "POST", "/api/lots")[0]).toEqual({
      type: "ntn_f",
      maturity: "2031-01-01",
      purchase_date: "2026-10-20",
      rate: "0.1352",
      unit_price: "912.345678",
      quantity: "1.25",
    });
  });

  it("closes without saving on Cancelar", async () => {
    const requests = stubRoutes({ "GET /api/bonds": () => Response.json({ bonds: catalogue }) });
    const { onClose, onSaved } = renderSheet();

    const dialog = await screen.findByRole("dialog", { name: "Adicionar compra" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    expect(sent(requests, "POST", "/api/lots")).toEqual([]);
  });
});

describe("the amount invested", () => {
  it("shows what the server says the purchase costs before saving, once every field is filled", async () => {
    const requests = stubRoutes({
      "GET /api/bonds": () => Response.json({ bonds: catalogue }),
      "POST /api/lots/preview": () => Response.json({ cost: "16098.72" }),
    });
    renderSheet();

    const form = await openForm("Adicionar compra");
    await pickBond(form, "Tesouro IPCA+ 2035", "ntn_b_principal 2035-05-15");
    fill(form, "Data da compra", "2024-05-12");
    fill(form, "Taxa", "6,21");
    fill(form, "Preço unitário", "2.012,34");
    expect(within(form).getByText("—")).toBeInTheDocument();
    fill(form, "Quantidade", "8");

    expect(await within(form).findByText("R$ 16.098,72")).toBeInTheDocument();
    expect(sent(requests, "POST", "/api/lots/preview")).toEqual([
      {
        type: "ntn_b_principal",
        maturity: "2035-05-15",
        purchase_date: "2024-05-12",
        rate: "0.0621",
        unit_price: "2012.34",
        quantity: "8",
      },
    ]);
    expect(sent(requests, "POST", "/api/lots")).toEqual([]);
  });

  it("turns back to a dash, without field messages, once the server rejects the typed values", async () => {
    stubRoutes({
      "GET /api/bonds": () => Response.json({ bonds: catalogue }),
      "POST /api/lots/preview": (req) => {
        const body = req.body as LotInput;
        return body.quantity === "0"
          ? problem(422, "Unprocessable Entity", "validation failed", [
              { location: "body.quantity", message: "expected number > 0" },
            ])
          : Response.json({ cost: "16098.72" });
      },
    });
    renderSheet();

    const form = await openForm("Adicionar compra");
    await pickBond(form, "Tesouro IPCA+ 2035", "ntn_b_principal 2035-05-15");
    fillPurchase(form);
    expect(await within(form).findByText("R$ 16.098,72")).toBeInTheDocument();

    fill(form, "Quantidade", "0");

    await waitFor(() => expect(within(form).queryByText("R$ 16.098,72")).toBeNull());
    expect(within(form).getByText("—")).toBeInTheDocument();
    expect(within(form).queryByText(/Informe uma quantidade/)).toBeNull();
    expect(within(form).getByLabelText("Quantidade")).toBeValid();
  });

  it("dims the figure while the next one is on its way", async () => {
    let cost = "100.00";
    let release = () => {};
    const requests = stubRoutes({
      "GET /api/bonds": () => Response.json({ bonds: catalogue }),
      "POST /api/lots/preview": async () => {
        const answer = cost;
        if (answer !== "100.00") await new Promise<void>((resolve) => (release = resolve));
        return Response.json({ cost: answer });
      },
    });
    renderSheet();

    const form = await openForm("Adicionar compra");
    await pickBond(form, "Tesouro IPCA+ 2035", "ntn_b_principal 2035-05-15");
    fillPurchase(form);
    const figure = await within(form).findByText("R$ 100,00");
    const panel = figure.closest("[aria-busy]");
    expect(panel).toHaveAttribute("aria-busy", "false");

    cost = "200.00";
    fill(form, "Quantidade", "9");
    await waitFor(() => expect(panel).toHaveAttribute("aria-busy", "true"));
    expect(within(form).getByText("R$ 100,00")).toBeInTheDocument();

    await waitFor(() => expect(sent(requests, "POST", "/api/lots/preview")).toHaveLength(2));
    release();
    expect(await within(form).findByText("R$ 200,00")).toBeInTheDocument();
    expect(panel).toHaveAttribute("aria-busy", "false");
  });
});

describe("a rejected purchase", () => {
  it("shows the reason next to each field the server rejects, until the owner edits", async () => {
    stubRoutes({
      "GET /api/bonds": () => Response.json({ bonds: catalogue }),
      "POST /api/lots/preview": () => Response.json({ cost: "16098.72" }),
      "POST /api/lots": () =>
        problem(422, "Unprocessable Entity", "validation failed", [
          { location: "body.unit_price", message: "expected number > 0" },
          {
            location: "body.maturity",
            message: "must be after the purchase date",
            code: "not_after_purchase",
          },
        ]),
    });
    renderSheet();

    const form = await openForm("Adicionar compra");
    await pickBond(form, "Tesouro IPCA+ 2035", "ntn_b_principal 2035-05-15");
    fillPurchase(form);
    fireEvent.click(within(form).getByRole("button", { name: "Adicionar" }));

    await within(form).findByText("Informe um preço maior que zero, com até 6 casas decimais.");
    expect(within(form).getByLabelText("Preço unitário")).toBeInvalid();
    expect(within(form).getByLabelText("Título")).toBeInvalid();
    expect(within(form).getByLabelText("Título")).toHaveAccessibleDescription(
      "Precisa ser depois da data da compra.",
    );
    expect(within(form).getByLabelText("Quantidade")).toBeValid();
    expect(within(form).queryByRole("alert")).toBeNull();

    fill(form, "Preço unitário", "2.012,35");
    expect(within(form).queryByText(/Informe um preço/)).toBeNull();
    expect(within(form).getByLabelText("Título")).toBeValid();
  });

  it("puts the maturity message on its own row under Outro título", async () => {
    stubRoutes({
      "GET /api/bonds": () => Response.json({ bonds: catalogue }),
      "POST /api/lots": () =>
        problem(422, "Unprocessable Entity", "validation failed", [
          {
            location: "body.maturity",
            message: "must be a date Tesouro matures this type of bond on",
            code: "not_maturity_day",
          },
        ]),
    });
    renderSheet();

    const form = await openForm("Adicionar compra");
    fill(form, "Título", "other");
    fill(form, "Vencimento", "2031-01-02");
    fireEvent.click(within(form).getByRole("button", { name: "Adicionar" }));

    await waitFor(() => expect(within(form).getByLabelText("Vencimento")).toBeInvalid());
    expect(within(form).getByLabelText("Vencimento")).toHaveAccessibleDescription(
      "O Tesouro Prefixado vence no dia 1 de um mês.",
    );
    expect(within(form).getByLabelText("Título")).toBeValid();
    expect(within(form).getByLabelText("Tipo")).toBeValid();
  });

  it("says the purchase could not be added when the failure names no field", async () => {
    stubRoutes({
      "GET /api/bonds": () => Response.json({ bonds: catalogue }),
      "POST /api/lots": () => problem(500, "Internal Server Error", "boom"),
    });
    const { onClose, onSaved } = renderSheet();

    const form = await openForm("Adicionar compra");
    fireEvent.click(within(form).getByRole("button", { name: "Adicionar" }));

    expect(await within(form).findByRole("alert")).toHaveTextContent(
      "Não foi possível adicionar a compra.",
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("editing a purchase", () => {
  it("fills the form with the lot, bond included, and saves what the owner changes", async () => {
    const requests = stubRoutes({
      "GET /api/bonds": () => Response.json({ bonds: catalogue }),
      "POST /api/lots/preview": () => Response.json({ cost: "2201.25" }),
      "PUT /api/lots/:id": (req) => Response.json({ ...ltn, ...(req.body as object), id: 1 }),
    });
    const { onClose, onSaved } = renderSheet(ltn);

    const form = await openForm("Editar compra");
    expect(within(form).getByLabelText("Título")).toHaveDisplayValue("Tesouro Prefixado 2027");
    expect(within(form).getByLabelText("Data da compra")).toHaveValue("2026-01-02");
    expect(within(form).getByLabelText("Taxa")).toHaveValue("12,76");
    expect(within(form).getByLabelText("Preço unitário")).toHaveValue("880,50");
    expect(within(form).getByLabelText("Quantidade")).toHaveValue("2,5");
    expect(await within(form).findByText("R$ 2.201,25")).toBeInTheDocument();

    fill(form, "Quantidade", "3");
    fireEvent.click(within(form).getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 1, quantity: "3" }));
    expect(sent(requests, "PUT", "/api/lots/1")).toEqual([
      {
        type: "ltn",
        maturity: "2027-01-01",
        purchase_date: "2026-01-02",
        rate: "0.1276",
        unit_price: "880.50",
        quantity: "3",
      },
    ]);
    expect(sent(requests, "POST", "/api/lots")).toEqual([]);
  });

  it("says the purchase could not be saved when the failure names no field", async () => {
    stubRoutes({
      "GET /api/bonds": () => Response.json({ bonds: catalogue }),
      "POST /api/lots/preview": () => Response.json({ cost: "2201.25" }),
      "PUT /api/lots/:id": () => problem(500, "Internal Server Error", "boom"),
    });
    renderSheet(ltn);

    const form = await openForm("Editar compra");
    fireEvent.click(within(form).getByRole("button", { name: "Salvar" }));

    expect(await within(form).findByRole("alert")).toHaveTextContent(
      "Não foi possível salvar a compra.",
    );
  });
});
