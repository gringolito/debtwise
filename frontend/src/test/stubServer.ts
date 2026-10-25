import { vi } from "vitest";

export interface RecordedRequest {
  method: string;
  url: string;
}

// Stubs the network under the generated SDK, answering every request with `respond`, so the
// tests cover the wire contract.
export function stubServer(
  respond: (req: RecordedRequest) => Response | Promise<Response>,
): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Request) => {
      const req = { method: input.method, url: input.url };
      requests.push(req);
      return respond(req);
    }),
  );
  return requests;
}

// Stubs the network with one handler per "METHOD /path", so a test answers each endpoint on its own.
// A request with no handler gets a 404 problem document and is still recorded.
export function stubRoutes(
  routes: Record<string, (req: RecordedRequest) => Response | Promise<Response>>,
): RecordedRequest[] {
  return stubServer((req) => {
    const key = `${req.method} ${new URL(req.url).pathname}`;
    const route = routes[key];
    if (!route) {
      return Response.json(
        { title: "Not Found", status: 404, detail: `no stub for ${key}` },
        { status: 404 },
      );
    }
    return route(req);
  });
}
