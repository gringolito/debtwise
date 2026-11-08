import { within } from "@testing-library/react";

/** text is what an element shows, with the whitespace between its parts collapsed. */
export function text(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** words is what an element shows, each of its text nodes a word apart, as a screen reader reads. */
export function words(element: Element): string {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const part = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    if (part) parts.push(part);
  }
  return parts.join(" ");
}

/** rowTexts is the text of every cell of every row of a table, header row included. */
export function rowTexts(table: HTMLElement): string[][] {
  return within(table)
    .getAllByRole("row")
    .map((row) => Array.from(row.querySelectorAll("th, td")).map(text));
}
