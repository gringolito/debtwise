import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type LotChange, LotFeedback } from "@/components/lots/LotFeedback";
import type { Lot, LotComparison, LotInput } from "@/lib/api";
import { text } from "@/test/dom";
import { amount, lotComparison } from "@/test/lotFixtures";
import { stubRoutes } from "@/test/stubServer";

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
    expect(within(dialog).getByText(line.slice(0, 12), { exact: false })).toHaveTextContent(line);
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
      ["Líquido no vencimento", "R$ 18.986,45*"],
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
        ["Vantagem sobre amortizar", "+ R$ 2.180,40 para − R$ 120,00*"],
      ]),
    );
    expect(within(dialog).getByText("* Baseado na projeção atual.")).toBeVisible();
    expect(within(dialog).getAllByRole("button").map(text)).toEqual(["Entendi"]);
  });
});
