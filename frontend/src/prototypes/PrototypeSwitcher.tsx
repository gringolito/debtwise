// PROTOTYPE, throwaway: floating switcher between design variants, development builds only.
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect } from "react";
import { setVariant, usePrototypeVariant, variantNames, variants } from "@/prototypes/variant";

function step(from: (typeof variants)[number], by: number) {
  const i = variants.indexOf(from);
  return variants[(i + by + variants.length) % variants.length];
}

function typing(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export function PrototypeSwitcher() {
  const variant = usePrototypeVariant();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (typing(event.target) || event.altKey || event.metaKey || event.ctrlKey) return;
      if (!event.shiftKey) return;
      if (event.key === "ArrowLeft") setVariant(step(variant, -1));
      if (event.key === "ArrowRight") setVariant(step(variant, 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant]);

  if (!import.meta.env.DEV) return null;

  return (
    <div className="proto-switcher" role="group" aria-label="Variante do protótipo (Shift + ← →)">
      <button
        type="button"
        aria-label="Variante anterior"
        onClick={() => setVariant(step(variant, -1))}
      >
        <ChevronLeftIcon aria-hidden="true" className="size-4" />
      </button>
      <span>
        <b>{variant}</b> {variantNames[variant]}
      </span>
      <button
        type="button"
        aria-label="Próxima variante"
        onClick={() => setVariant(step(variant, 1))}
      >
        <ChevronRightIcon aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
