import { within } from "@testing-library/react";

/** text is what an element shows, with the whitespace between its parts collapsed. */
export function text(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** rowTexts is the text of every cell of every row of a table, header row included. */
export function rowTexts(table: HTMLElement): string[][] {
  return within(table)
    .getAllByRole("row")
    .map((row) => Array.from(row.querySelectorAll("th, td")).map(text));
}
