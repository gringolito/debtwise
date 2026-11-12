import { useLayoutEffect, useReducer, useRef } from "react";
import { groupThousands } from "@/lib/format";

// Where the caret goes in formatted text: after as many characters other than separators as were
// before it in what the owner typed.
function caretIn(formatted: string, typed: string, caret: number, separator: string): number {
  const kept = typed.slice(0, caret).replaceAll(separator, "").length;
  let position = 0;
  for (let seen = 0; position < formatted.length && seen < kept; position++) {
    if (formatted[position] !== separator) seen++;
  }
  return position;
}

/**
 * useFormattedValue handles what the owner types into an input whose value is `value`. `format`
 * writes the text typed, given the text it replaces, as the input should show it, with `separator`
 * as the characters it inserts; the caret stays after the characters it followed, wherever the
 * owner edits. Spread what it returns on the input.
 */
export function useFormattedValue(
  value: string,
  onChange: (value: string) => void,
  format: (typed: string, previous: string) => string,
  separator: string,
) {
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  // The input shows its old text again when the owner's edit changes nothing, as a slash deleted
  // from "15/03" does, so the caret is placed on a render of its own.
  const [, redraw] = useReducer((renders: number) => renders + 1, 0);

  useLayoutEffect(() => {
    if (caret.current === null) return;
    ref.current?.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  const change = (event: React.ChangeEvent<HTMLInputElement>) => {
    const typed = event.target.value;
    const next = format(typed, value);
    if (next !== typed) {
      caret.current = caretIn(next, typed, event.target.selectionStart ?? typed.length, separator);
      redraw();
    }
    onChange(next);
  };

  return { ref, value, onChange: change };
}

const asTyped = (typed: string) => typed;

/**
 * useTypedValue handles what the owner types into an input whose value is `value`. With
 * `grouped`, it groups the thousands of the number being typed and keeps the caret after the
 * characters it followed. Spread what it returns on the input.
 */
export function useTypedValue(value: string, onChange: (value: string) => void, grouped: boolean) {
  return useFormattedValue(value, onChange, grouped ? groupThousands : asTyped, ".");
}
