// The SDK in ./generated/ comes from docs/openapi.json through `mise run generate:openapi`.
// Never hand-edit it.
import { client } from "./generated/client.gen";
import { health } from "./generated/sdk.gen";
import type { Health } from "./generated/types.gen";

export type { Health };

// An absolute base, so `new Request()` also resolves it under Node's fetch in tests. The SPA
// shares the API's origin.
client.setConfig({ baseUrl: new URL("/api", globalThis.location.href).toString() });

export async function fetchHealth(): Promise<Health> {
  const { data } = await health({ throwOnError: true });
  return data;
}
