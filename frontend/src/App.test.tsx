import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAt } from "./test/renderAt";
import { stubRoutes, stubServer } from "./test/stubServer";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("server status", () => {
  it("reports a healthy server", async () => {
    const requests = stubRoutes({ "GET /api/health": () => Response.json({ status: "ok" }) });

    renderAt("/");

    expect(await screen.findByText("Servidor disponível")).toBeInTheDocument();
    // Same origin as the page: in the images Caddy proxies /api to the server.
    expect(requests).toContainEqual({
      method: "GET",
      url: new URL("/api/health", window.location.origin).href,
    });
  });

  it("reports an unavailable server", async () => {
    stubServer(() =>
      Response.json(
        { title: "Service Unavailable", status: 503, detail: "database is unavailable" },
        { status: 503 },
      ),
    );

    renderAt("/");

    expect(await screen.findByText("Servidor indisponível")).toBeInTheDocument();
  });

  it("reports an unreachable server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    renderAt("/");

    expect(await screen.findByText("Servidor indisponível")).toBeInTheDocument();
  });

  it("says it is checking until the server answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );

    renderAt("/");

    expect(await screen.findByText("Verificando servidor…")).toBeInTheDocument();
  });
});

describe("shell", () => {
  it("names the app in every page", async () => {
    stubRoutes({ "GET /api/health": () => Response.json({ status: "ok" }) });

    renderAt("/");

    expect(await screen.findByRole("heading", { name: "DebtWise" })).toBeInTheDocument();
  });

  it("answers an unknown address in Portuguese", async () => {
    stubServer(() => Response.json({ status: "ok" }));

    renderAt("/nao-existe");

    expect(await screen.findByText("Página não encontrada.")).toBeInTheDocument();
  });
});
