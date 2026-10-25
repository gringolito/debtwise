import { vi } from "vitest";

export interface RecordedRequest {
  method: string;
  url: string;
}

// Stubs the network under the generated SDK, answering every request with `respond`, so the
// tests cover the wire contract.
export function stubServer(respond: (req: RecordedRequest) => Response): RecordedRequest[] {
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
