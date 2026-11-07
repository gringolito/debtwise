import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it.each(["hero-figure", "large-title", "title-2", "headline", "body", "callout", "footnote"])(
    "keeps a text color next to the text-%s size",
    (size) => {
      expect(cn("text-accent", `text-${size}`)).toBe(`text-accent text-${size}`);
      expect(cn(`text-${size}`, "text-accent")).toBe(`text-${size} text-accent`);
    },
  );

  it("lets a later size replace an earlier one and keeps the color", () => {
    expect(cn("text-callout text-muted-foreground", "text-footnote")).toBe(
      "text-muted-foreground text-footnote",
    );
  });
});
