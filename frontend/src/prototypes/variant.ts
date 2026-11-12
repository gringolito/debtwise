// PROTOTYPE, throwaway: the design exploration's variant switch. A is the current design, B the
// "Orvalho nítido" direction, C is B with Decidir's ledger verdict. `?variant=` picks one on load
// and is then removed from the address, since a search param the routes don't expect keeps Início's
// exact-match link from reading as current. The choice lives in sessionStorage.
import { useSyncExternalStore } from "react";

export const variants = ["A", "B", "C"] as const;
export type Variant = (typeof variants)[number];

export const variantNames: Record<Variant, string> = {
  A: "Atual",
  B: "Orvalho nítido",
  C: "Orvalho nítido · Decidir em colunas",
};

const KEY = "debtwise.prototype.variant";
const listeners = new Set<() => void>();

function isVariant(value: unknown): value is Variant {
  return variants.includes(value as Variant);
}

function initial(): Variant {
  if (!import.meta.env.DEV || typeof window === "undefined") return "A";
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get("variant");
  if (fromUrl !== null) {
    url.searchParams.delete("variant");
    window.history.replaceState(window.history.state, "", url);
  }
  if (isVariant(fromUrl)) {
    sessionStorage.setItem(KEY, fromUrl);
    return fromUrl;
  }
  const stored = sessionStorage.getItem(KEY);
  return isVariant(stored) ? stored : "A";
}

let current: Variant = initial();

function apply(variant: Variant) {
  if (typeof document === "undefined") return;
  if (variant === "A") delete document.documentElement.dataset.proto;
  else document.documentElement.dataset.proto = variant;
}
apply(current);

export function setVariant(variant: Variant) {
  current = variant;
  sessionStorage.setItem(KEY, variant);
  apply(variant);
  for (const listener of listeners) listener();
}

export function usePrototypeVariant(): Variant {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => "A" as Variant,
  );
}
