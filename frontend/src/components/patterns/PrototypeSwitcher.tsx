// PROTOTYPE: throwaway variant switcher. It stays on the prototype branch and never ships.
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect } from "react";

export interface PrototypeVariant {
  key: string;
  name: string;
}

/** usePrototypeVariant reads `?variant=` and falls back to the first variant. */
export function usePrototypeVariant(variants: PrototypeVariant[]): string {
  const search = useSearch({ strict: false }) as { variant?: unknown };
  const key = String(search.variant ?? "");
  return variants.some((variant) => variant.key === key) ? key : variants[0].key;
}

interface PrototypeSwitcherProps {
  variants: PrototypeVariant[];
  current: string;
}

export function PrototypeSwitcher(props: PrototypeSwitcherProps) {
  return import.meta.env.DEV ? <Switcher {...props} /> : null;
}

function Switcher({ variants, current }: PrototypeSwitcherProps) {
  const navigate = useNavigate();
  const index = variants.findIndex((variant) => variant.key === current);

  const go = (step: number) => {
    const next = variants[(index + step + variants.length) % variants.length];
    void navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({ ...prev, variant: next.key }),
      replace: true,
    } as never);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const variant = variants[index];
  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-caution p-1 font-mono text-footnote text-background shadow-2xl ring-2 ring-background">
      <button
        type="button"
        aria-label="Variante anterior"
        onClick={() => go(-1)}
        className="rounded-full p-2 hover:bg-background/20"
      >
        <ChevronLeftIcon className="size-4" />
      </button>
      <span className="px-2 whitespace-nowrap">
        PROTÓTIPO · {variant.key} ({variant.name}) · {index + 1}/{variants.length}
      </span>
      <button
        type="button"
        aria-label="Próxima variante"
        onClick={() => go(1)}
        className="rounded-full p-2 hover:bg-background/20"
      >
        <ChevronRightIcon className="size-4" />
      </button>
    </div>
  );
}
