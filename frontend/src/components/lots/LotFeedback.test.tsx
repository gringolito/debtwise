import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type LotChange, LotFeedback } from "@/components/lots/LotFeedback";
import type { Lot, LotComparison, LotInput } from "@/lib/api";
import { text } from "@/test/dom";
import { amount, lotComparison } from "@/test/lotFixtures";
import { problem, stubRoutes } from "@/test/stubServer";

afterEach(() => {
  vi.unstubAllGlobals();
});

const bought: Lot = {
  id: 3,
  type: "ltn",
  maturity: "2029-01-01",
  purchase_date: "2025-01-10",
  rate: "0.1185",
  unit_price: "702.15",
  quantity: "20",
};

/** renderFeedback opens the feedback on change, with the server comparing each lot as compare does. */
function renderFeedback(change: LotChange, compare: (input: LotInput) => LotComparison) {
  const requests = stubRoutes({
    "POST /api/lots/comparison": (req) => Response.json(compare(req.body as LotInput)),
  });
  const onClose = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <LotFeedback change={change} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { requests, onClose };
}

const facts = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole("term")
    .map((term) => [text(term), text(term.nextElementSibling as HTMLElement)]);

const figure = (dialog: HTMLElement) =>
  text(within(dialog).getByText("Você vai ganhar").parentElement as HTMLElement);

describe("a recorded lot", () => {
  it("celebrates the gain, the figures behind it and the advantage over prepaying", async () => {
    const { requests, onClose } = renderFeedback(
      { kind: "recorded", lot: bought },
      () => lotComparison,
    );

    const dialog = await screen.findByRole("dialog", { name: "Compra registrada!" });
    expect(figure(dialog)).toBe(
      "Você vai ganhar R$ 4.943,45 até 01/01/2029, já descontados impostos e custódia",
    );
    expect(facts(dialog)).toEqual([
      ["Valor investido", "R$ 14.043,00"],
      ["Líquido no vencimento", "R$ 18.986,45"],
    ]);
    expect(within(dialog).getByText(/^Você fica com/)).toHaveTextContent(
      "Você fica com R$ 2.180,40* a mais do que se amortizasse reduzindo o prazo, até 01/01/2029.",
    );
    expect(within(dialog).getByText("* Baseado na projeção atual.")).toBeVisible();
    expect(
      requests.map((r) => [r.method, new URL(r.url).pathname + new URL(r.url).search, r.body]),
    ).toEqual([
      [
        "POST",
        "/api/lots/comparison?effect=shorten_term",
        {
          type: "ltn",
          maturity: "2029-01-01",
          purchase_date: "2025-01-10",
          rate: "0.1185",
          unit_price: "702.15",
          quantity: "20",
        },
      ],
    ]);

    expect(within(dialog).getAllByRole("button").map(text)).toEqual(["Continuar"]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Continuar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["-310.25", "Amortizar reduzindo o prazo renderia R$ 310,25* a mais até 01/01/2029."],
    ["0.00", "Investir e amortizar reduzindo o prazo dão o mesmo resultado até 01/01/2029."],
  ])("says how an advantage of %s compares with prepaying", async (advantage, line) => {
    renderFeedback({ kind: "recorded", lot: bought }, () => ({ ...lotComparison, advantage }));

    const dialog = await screen.findByRole("dialog", { name: "Compra registrada!" });
    expect(within(dialog).getByText(/amortiza/i)).toHaveTextContent(line);
  });

  it("shows no gain for a lot that pays back no more than it cost", async () => {
    renderFeedback({ kind: "recorded", lot: bought }, () => ({
      ...lotComparison,
      maturity: amount("14000.00", "0.00", "0.00", "10.00", "13990.00"),
      gain: "-53.00",
    }));

    const dialog = await screen.findByRole("dialog", { name: "Compra registrada!" });
    expect(within(dialog).queryByText("Você vai ganhar")).toBeNull();
    expect(facts(dialog)).toEqual([
      ["Valor investido", "R$ 14.043,00"],
      ["Líquido no vencimento", "R$ 13.990,00"],
    ]);
  });

  it("still opens, and closes, when the comparison fails to load", async () => {
    const requests = stubRoutes({
      "POST /api/lots/comparison": () => problem(500, "Internal Server Error", "boom"),
    });
    const onClose = vi.fn();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <LotFeedback change={{ kind: "recorded", lot: bought }} onClose={onClose} />
      </QueryClientProvider>,
    );

    const dialog = await screen.findByRole("dialog", { name: "Compra registrada!" });
    expect(requests).toHaveLength(1);
    expect(within(dialog).queryByRole("term")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Continuar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("marks the gain of a lot whose Maturity Value reads a projected IPCA", async () => {
    renderFeedback({ kind: "recorded", lot: bought }, () => ({
      ...lotComparison,
      maturity: {
        ...amount("20000.00", "0.00", "887.55", "126.00", "18986.45"),
        projected_by: [{ index: "ipca", method: "focus" }],
      },
      projected_by: [],
    }));

    const dialog = await screen.findByRole("dialog", { name: "Compra registrada!" });
    expect(figure(dialog)).toBe(
      "Você vai ganhar R$ 4.943,45* até 01/01/2029, já descontados impostos e custódia",
    );
    expect(facts(dialog)).toEqual([
      ["Valor investido", "R$ 14.043,00"],
      ["Líquido no vencimento*", "R$ 18.986,45"],
    ]);
    expect(within(dialog).getByText(/^Você fica com/)).toHaveTextContent(
      "Você fica com R$ 2.180,40 a mais",
    );
    expect(within(dialog).getByText("* Baseado na projeção atual.")).toBeVisible();
  });

  it("marks no figure and adds no footnote when nothing reads a projection", async () => {
    renderFeedback({ kind: "recorded", lot: bought }, () => ({
      ...lotComparison,
      projected_by: [],
    }));

    const dialog = await screen.findByRole("dialog", { name: "Compra registrada!" });
    expect(within(dialog).queryByText(/\*/)).toBeNull();
  });

  it("shows only the amount invested of a lot without values", async () => {
    renderFeedback({ kind: "recorded", lot: bought }, () => ({
      amount_invested: "3200.00",
      horizon: "2032-08-15",
      effect: "shorten_term",
      unavailable: "missing_ipca",
      projected_by: [],
    }));

    const dialog = await screen.findByRole("dialog", { name: "Compra registrada!" });
    expect(facts(dialog)).toEqual([["Valor investido", "R$ 3.200,00"]]);
    expect(within(dialog).queryByText("Você vai ganhar")).toBeNull();
    expect(within(dialog).queryByText(/amortiza/)).toBeNull();
    expect(within(dialog).queryByText(/\*/)).toBeNull();
  });

  it("leaves out the comparison of a lot it can't compare", async () => {
    const { advantage: _, ...unavailable } = lotComparison;
    renderFeedback({ kind: "recorded", lot: bought }, () => ({
      ...unavailable,
      unavailable: "before_contract",
      projected_by: [],
    }));

    const dialog = await screen.findByRole("dialog", { name: "Compra registrada!" });
    expect(figure(dialog)).toMatch(/^Você vai ganhar R\$ 4\.943,45/);
    expect(within(dialog).queryByText(/amortiza/)).toBeNull();
    expect(within(dialog).queryByRole("alert")).toBeNull();
  });
});

describe("an edited lot", () => {
  it("informs of the net at maturity and the advantage over prepaying, before and after", async () => {
    const edited: Lot = { ...bought, quantity: "10" };
    renderFeedback({ kind: "edited", lot: edited, replaced: bought }, (input) =>
      input.quantity === "10"
        ? {
            ...lotComparison,
            amount_invested: "7021.50",
            maturity: {
              ...amount("10000.00", "0.00", "443.78", "63.00", "9493.22"),
              projected_by: [],
            },
            gain: "2471.72",
            advantage: "-120.00",
          }
        : lotComparison,
    );

    const dialog = await screen.findByRole("dialog", { name: "Compra atualizada" });
    await waitFor(() =>
      expect(facts(dialog)).toEqual([
        ["Líquido no vencimento", "R$ 18.986,45 para R$ 9.493,22"],
        ["Comparado a amortizar*", "R$ 2.180,40 a mais para R$ 120,00 a menos"],
      ]),
    );
    expect(within(dialog).getByText("* Baseado na projeção atual.")).toBeVisible();
    expect(within(dialog).getAllByRole("button").map(text)).toEqual(["Entendi"]);
  });

  it("marks a change whose figure before read a projection, though the one after doesn't", async () => {
    const edited: Lot = { ...bought, type: "ltn" };
    const replaced: Lot = { ...bought, type: "ntn_b_principal" };
    renderFeedback({ kind: "edited", lot: edited, replaced }, (input) =>
      input.type === "ltn"
        ? { ...lotComparison, projected_by: [] }
        : {
            ...lotComparison,
            maturity: {
              ...amount("21000.00", "0.00", "900.00", "130.00", "19970.00"),
              projected_by: [{ index: "ipca", method: "focus" }],
            },
            advantage: "2500.00",
            projected_by: [{ index: "ipca", method: "focus" }],
          },
    );

    const dialog = await screen.findByRole("dialog", { name: "Compra atualizada" });
    await waitFor(() =>
      expect(facts(dialog)).toEqual([
        ["Líquido no vencimento*", "R$ 19.970,00 para R$ 18.986,45"],
        ["Vantagem sobre amortizar*", "R$ 2.500,00 para R$ 2.180,40"],
      ]),
    );
    expect(within(dialog).getByText("* Baseado na projeção atual.")).toBeVisible();
  });

  it("writes a dash for a figure one side lacks, and a figure the edit kept once", async () => {
    const edited: Lot = { ...bought, purchase_date: "2025-02-10" };
    renderFeedback({ kind: "edited", lot: edited, replaced: bought }, (input) =>
      input.purchase_date === "2025-02-10"
        ? lotComparison
        : {
            amount_invested: "14043.00",
            maturity: lotComparison.maturity,
            gain: lotComparison.gain,
            horizon: "2029-01-01",
            effect: "shorten_term",
            unavailable: "before_contract",
            projected_by: [],
          },
    );

    const dialog = await screen.findByRole("dialog", { name: "Compra atualizada" });
    await waitFor(() =>
      expect(facts(dialog)).toEqual([
        ["Líquido no vencimento", "R$ 18.986,45"],
        ["Vantagem sobre amortizar*", "— para R$ 2.180,40"],
      ]),
    );
  });

  it("calls a prepaying win on both sides a disadvantage, without a sign", async () => {
    const edited: Lot = { ...bought, quantity: "10" };
    renderFeedback({ kind: "edited", lot: edited, replaced: bought }, (input) => ({
      ...lotComparison,
      advantage: input.quantity === "10" ? "-10667.28" : "-8481.31",
    }));

    const dialog = await screen.findByRole("dialog", { name: "Compra atualizada" });
    await waitFor(() =>
      expect(facts(dialog)[1]).toEqual([
        "Desvantagem sobre amortizar*",
        "R$ 8.481,31 para R$ 10.667,28",
      ]),
    );
  });
});
