import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { words } from "@/test/dom";
import {
  checkFor,
  ipca2035,
  ipca2035Again,
  prefixado2029,
  stubInvestments,
  uncheckable,
  waitingOnIpca,
} from "@/test/lotFixtures";
import { renderAt } from "@/test/renderAt";
import { problem } from "@/test/stubServer";

afterEach(() => {
  vi.unstubAllGlobals();
});

const checksList = () =>
  screen.findByRole("list", { name: "Compras, das que mais rendem vendidas às que menos rendem" });
const rows = (list: HTMLElement) => within(list).getAllByRole("link").map(words);
const lots = [ipca2035, ipca2035Again, prefixado2029, waitingOnIpca];

describe("Venda antecipada", () => {
  it("lists what selling each lot gains over holding it, in the order the API ranks them", async () => {
    stubInvestments({
      lots,
      checks: [
        checkFor(ipca2035Again, "-120.00"),
        checkFor(ipca2035, "2140.00"),
        checkFor(prefixado2029, "0.00"),
        uncheckable(waitingOnIpca, "missing_ipca"),
      ],
    });
    renderAt("/investimentos/venda-antecipada");

    const list = await checksList();
    expect(rows(list)).toEqual([
      "Tesouro IPCA+ 2035 Compra em 18/11/2024 + R$ 120,00 vender",
      "Tesouro IPCA+ 2035 Compra em 12/05/2024 − R$ 2.140,00 manter",
      "Tesouro Prefixado com Juros Semestrais 2029 Compra em 10/01/2025 R$ 0,00 manter",
      "Tesouro IPCA+ 2045 Compra em 01/06/2026 Aguardando o IPCA",
    ]);
    expect(within(list).getByText("+ R$ 120,00")).toHaveClass("text-positive");
    expect(within(list).getByText("− R$ 2.140,00")).toHaveClass("text-destructive");
    expect(within(list).getByText("R$ 0,00")).not.toHaveClass("text-positive", "text-destructive");
  });

  it("compares again for the effect picked and opens a lot with it", async () => {
    const requests = stubInvestments({
      lots: [ipca2035],
      checks: {
        shorten_term: [checkFor(ipca2035, "2140.00")],
        lower_installment: [checkFor(ipca2035, "-310.55")],
      },
    });
    renderAt("/investimentos/venda-antecipada");

    expect(rows(await checksList())).toEqual([
      "Tesouro IPCA+ 2035 Compra em 12/05/2024 − R$ 2.140,00 manter",
    ]);

    fireEvent.click(screen.getByRole("radio", { name: "Reduzir prestação" }));

    await waitFor(async () =>
      expect(rows(await checksList())).toEqual([
        "Tesouro IPCA+ 2035 Compra em 12/05/2024 + R$ 310,55 vender",
      ]),
    );
    expect(
      requests
        .filter((r) => new URL(r.url).pathname === "/api/early-sale-checks")
        .map((r) => new URL(r.url).searchParams.get("effect")),
    ).toEqual(["shorten_term", "lower_installment"]);

    fireEvent.click(screen.getByRole("link", { name: /Compra em 12\/05\/2024/ }));

    const panel = await screen.findByRole("region", { name: "Venda antecipada" });
    expect(await within(panel).findByRole("heading", { name: "Vender rende mais" })).toBeVisible();
  });

  it("shows an error panel that compares again", async () => {
    let fail = true;
    stubInvestments({
      lots: [ipca2035],
      routes: {
        "GET /api/early-sale-checks": () =>
          fail
            ? problem(500, "Internal Server Error", "boom")
            : Response.json({
                date: "2026-11-06",
                effect: "shorten_term",
                checks: [checkFor(ipca2035, "2140.00")],
              }),
      },
    });
    renderAt("/investimentos/venda-antecipada");

    const error = await screen.findByRole("alert");
    expect(within(error).getByText("Não foi possível comparar suas compras")).toBeVisible();

    fail = false;
    fireEvent.click(within(error).getByRole("button", { name: "Tentar novamente" }));

    expect(rows(await checksList())).toHaveLength(1);
  });

  it("notes stale market data that any listed check reads, not only the first", async () => {
    const prefixado = checkFor(prefixado2029, "-55.00");
    const ipca = checkFor(ipca2035, "2140.00");
    stubInvestments({
      lots: [ipca2035, prefixado2029],
      checks: [
        { ...prefixado, market_data: { ...prefixado.market_data, indexes: [] } },
        {
          ...ipca,
          market_data: {
            ...ipca.market_data,
            indexes: [{ index: "ipca", status: "stale", refreshed_at: "2026-11-01T12:00:00Z" }],
          },
        },
      ],
    });
    renderAt("/investimentos/venda-antecipada");

    await checksList();
    expect(screen.getByText("IPCA de 01/11.")).toBeInTheDocument();
  });
});
