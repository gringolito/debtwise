import { vi } from "vitest";

export interface RecordedRequest {
  method: string;
  url: string;
  /** The parsed JSON body; absent when the request carried none. */
  body?: unknown;
}

type Responder = (req: RecordedRequest) => Response | Promise<Response>;
type RouteResponder = (
  req: RecordedRequest,
  params: Record<string, string>,
) => Response | Promise<Response>;

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
// A path segment written ":name" matches any value and reaches the handler in its params. A request
// with no handler gets a 404 problem document and is still recorded.
export function stubRoutes(routes: Record<string, RouteResponder>): RecordedRequest[] {
  const patterns = Object.entries(routes).map(([key, route]) => {
    const [method, path] = key.split(" ");
    const names: string[] = [];
    const source = path.replace(/:(\w+)/g, (_, name: string) => {
      names.push(name);
      return "([^/]+)";
    });
    return { method, regex: new RegExp(`^${source}$`), names, route };
  });
  return stubServer((req) => {
    const { pathname } = new URL(req.url);
    for (const { method, regex, names, route } of patterns) {
      const match = method === req.method ? regex.exec(pathname) : null;
      if (match) {
        return route(req, Object.fromEntries(names.map((name, i) => [name, match[i + 1]])));
      }
    }
    return Response.json(
      { title: "Not Found", status: 404, detail: `no stub for ${req.method} ${pathname}` },
      { status: 404 },
    );
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
