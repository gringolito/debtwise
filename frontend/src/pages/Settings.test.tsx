import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketDataStatus } from "@/lib/api";
import { text } from "@/test/dom";
import { registeredMortgage, statements } from "@/test/mortgageFixtures";
import { stubMortgageApi } from "@/test/mortgageApi";
import { renderAt } from "@/test/renderAt";
import { problem } from "@/test/stubServer";

// Instants in the owner's time zone, so "hoje" holds wherever the tests run.
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute).toISOString();

const FRESH_STATUS: MarketDataStatus = {
  refreshing: false,
  indexes: [
    { index: "tr", status: "fresh", refreshed_at: at(7, 8) },
    { index: "ipca", status: "fresh", refreshed_at: at(7, 7, 45) },
  ],
  focus: { status: "fresh", refreshed_at: at(7, 8, 5) },
  bonds: { status: "fresh", refreshed_at: at(7, 9, 15) },
};

type Routes = NonNullable<Parameters<typeof stubMortgageApi>[0]>["routes"];

function stubAjustes(routes: Routes = {}) {
  return stubMortgageApi({
    mortgage: registeredMortgage,
    statements,
    routes: { "GET /api/market-data/status": () => Response.json(FRESH_STATUS), ...routes },
  });
}

const section = (name: string) => screen.findByRole("region", { name });

async function sourceRows() {
  const list = await within(await section("Dados de mercado")).findByRole("list");
  return within(list).getAllByRole("listitem").map(text);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 7, 10, 30));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Ajustes", () => {
  it("links to the contract and to the bank statements, with what they hold", async () => {
    stubAjustes();
    renderAt("/ajustes");

    const links = within(await section("Financiamento")).getAllByRole("link");
    await waitFor(() => expect(text(links[1])).toBe("Extratos do banco3 registrados"));
    expect(links.map((link) => [text(link), link.getAttribute("href")])).toEqual([
      ["ContratoR$ 60.000,00 · SAC · Prefixado", "/financiamento/editar"],
      ["Extratos do banco3 registrados", "/financiamento?secao=extratos"],
    ]);

    fireEvent.click(links[1]);
    expect(await screen.findByRole("table", { name: "Extratos registrados" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Extratos" })).toBeChecked();
  });
});

describe("the market data", () => {
  it("shows when each source was last updated and how fresh it is", async () => {
    stubAjustes({
      "GET /api/market-data/status": () =>
        Response.json({
          refreshing: false,
          indexes: [
            { index: "tr", status: "fresh", refreshed_at: at(7, 8) },
            { index: "ipca", status: "stale", refreshed_at: at(4, 8) },
          ],
          focus: { status: "failed", refreshed_at: at(1, 18), failed_at: at(7, 8) },
          bonds: { status: "missing" },
        } satisfies MarketDataStatus),
    });
    renderAt("/ajustes");

    expect(await sourceRows()).toEqual([
      "Índices (Banco Central)Atualizado em 04/11/2026, desatualizado",
      "Expectativas (Focus)Atualizado em 01/11/2026, a última atualização falhou",
      "Preços dos títulos (Tesouro Direto)Nunca atualizado, indisponível",
    ]);
  });

  it("says a source updated today was updated today, at what time", async () => {
    stubAjustes();
    renderAt("/ajustes");

    expect(await sourceRows()).toEqual([
      "Índices (Banco Central)Atualizado hoje às 07:45, em dia",
      "Expectativas (Focus)Atualizado hoje às 08:05, em dia",
      "Preços dos títulos (Tesouro Direto)Atualizado hoje às 09:15, em dia",
    ]);
  });

  it("refreshes on request and shows it running until it ends", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 10, 7, 10, 30));
    const refreshed: MarketDataStatus = {
      ...FRESH_STATUS,
      indexes: FRESH_STATUS.indexes.map((s) => ({ ...s, refreshed_at: at(7, 10, 31) })),
    };
    // The refresh runs for one read of the status after it starts.
    let phase: "idle" | "running" | "done" = "idle";
    const requests = stubAjustes({
      "GET /api/market-data/status": () => {
        if (phase === "running") {
          phase = "done";
          return Response.json({ ...FRESH_STATUS, refreshing: true });
        }
        return Response.json(phase === "done" ? refreshed : FRESH_STATUS);
      },
      "POST /api/market-data/refresh": () => {
        phase = "running";
        return Response.json({ ...FRESH_STATUS, refreshing: true });
      },
    });
    renderAt("/ajustes");

    const market = await section("Dados de mercado");
    fireEvent.click(await within(market).findByRole("button", { name: "Atualizar agora" }));

    expect(await within(market).findByRole("status")).toHaveTextContent("Atualizando…");
    expect(within(market).queryByRole("button", { name: "Atualizar agora" })).toBeNull();
    await vi.advanceTimersByTimeAsync(4000);

    expect(await within(market).findByRole("button", { name: "Atualizar agora" })).toBeEnabled();
    expect((await sourceRows())[0]).toBe("Índices (Banco Central)Atualizado hoje às 10:31, em dia");
    expect(requests.filter((r) => r.method === "POST")).toHaveLength(1);
  });

  it("says so when the refresh cannot start", async () => {
    stubAjustes({
      "POST /api/market-data/refresh": () =>
        problem(500, "Internal Server Error", "unexpected failure"),
    });
    renderAt("/ajustes");

    const market = await section("Dados de mercado");
    fireEvent.click(await within(market).findByRole("button", { name: "Atualizar agora" }));

    expect(await within(market).findByText("Não foi possível atualizar.")).toBeInTheDocument();
    expect(within(market).getByRole("button", { name: "Atualizar agora" })).toBeInTheDocument();
  });

  it("offers to retry when the freshness cannot load", async () => {
    let fail = true;
    stubAjustes({
      "GET /api/market-data/status": () =>
        fail ? problem(503, "Service Unavailable", "down") : Response.json(FRESH_STATUS),
    });
    renderAt("/ajustes");

    const panel = await within(await section("Dados de mercado")).findByRole("alert");
    expect(within(panel).getByRole("heading")).toHaveTextContent(
      "Não foi possível carregar os dados de mercado",
    );
    fail = false;
    fireEvent.click(within(panel).getByRole("button", { name: "Tentar novamente" }));

    expect(await sourceRows()).toHaveLength(3);
  });
});

describe("deleting the mortgage", () => {
  it("asks for confirmation, deletes it and then opens the onboarding", async () => {
    const requests = stubAjustes();
    renderAt("/ajustes");

    fireEvent.click(await screen.findByRole("button", { name: "Excluir financiamento" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Excluir financiamento?" });
    expect(dialog).toHaveAccessibleDescription(
      "O contrato, as amortizações e os extratos registrados serão apagados. Suas compras de títulos continuam.",
    );
    expect(requests.some((req) => req.method === "DELETE")).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));

    expect(
      await screen.findByRole("heading", { name: "Seu financiamento, com clareza." }),
    ).toBeInTheDocument();
    expect(
      requests.filter((req) => req.method === "DELETE").map((req) => new URL(req.url).pathname),
    ).toEqual(["/api/mortgage"]);
  });

  it("keeps the mortgage when the owner cancels", async () => {
    const requests = stubAjustes();
    renderAt("/ajustes");

    fireEvent.click(await screen.findByRole("button", { name: "Excluir financiamento" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(requests.some((req) => req.method === "DELETE")).toBe(false);
    expect(screen.getByRole("heading", { level: 1, name: "Ajustes" })).toBeInTheDocument();
  });

  it("says so when the server refuses to delete", async () => {
    stubAjustes({
      "DELETE /api/mortgage": () => problem(500, "Internal Server Error", "unexpected failure"),
    });
    renderAt("/ajustes");

    fireEvent.click(await screen.findByRole("button", { name: "Excluir financiamento" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível excluir o financiamento.",
    );
    expect(screen.getByRole("heading", { level: 1, name: "Ajustes" })).toBeInTheDocument();
  });
});
