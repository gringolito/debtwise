import { vi } from "vitest";

export interface RecordedRequest {
  method: string;
  url: string;
  /** The parsed JSON body; absent when the request carried none. */
  body?: unknown;
}

type Responder = (req: RecordedRequest) => Response | Promise<Response>;

// Stubs the network under the generated SDK, answering every request with `respond`, so the
// tests cover the wire contract.
export function stubServer(respond: Responder): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Request) => {
      const req: RecordedRequest = { method: input.method, url: input.url };
      const text = await input.text();
      if (text !== "") req.body = JSON.parse(text);
      requests.push(req);
      return respond(req);
    }),
  );
  return requests;
}

// Stubs the network with one handler per "METHOD /path", so a test answers each endpoint on its own.
// A request with no handler gets a 404 problem document and is still recorded.
export function stubRoutes(routes: Record<string, Responder>): RecordedRequest[] {
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

export function problem(
  status: number,
  title: string,
  detail: string,
  errors?: { location: string; message: string }[],
): Response {
  return new Response(JSON.stringify({ title, status, detail, errors }), {
    status,
    headers: { "Content-Type": "application/problem+json" },
  });
}
