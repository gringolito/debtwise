import { useLayoutEffect, useRef } from "react";
import { groupThousands } from "@/lib/format";

// Where the caret goes in formatted text: after as many characters other than group dots as were
// before it in what the owner typed.
function caretIn(formatted: string, typed: string, caret: number): number {
  const kept = typed.slice(0, caret).replaceAll(".", "").length;
  let position = 0;
  for (let seen = 0; position < formatted.length && seen < kept; position++) {
    if (formatted[position] !== ".") seen++;
  }
  return position;
}

/**
 * useTypedValue handles what the owner types into an input whose value is `value`. With
 * `grouped`, it groups the thousands of the number being typed and keeps the caret after the
 * characters it followed. Spread what it returns on the input.
 */
export function useTypedValue(value: string, onChange: (value: string) => void, grouped: boolean) {
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (caret.current === null) return;
    ref.current?.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  const change = (event: React.ChangeEvent<HTMLInputElement>) => {
    const typed = event.target.value;
    const next = grouped ? groupThousands(typed, value) : typed;
    if (next !== typed) {
      caret.current = caretIn(next, typed, event.target.selectionStart ?? typed.length);
    }
    onChange(next);
  };

  return { ref, value, onChange: change };
}
