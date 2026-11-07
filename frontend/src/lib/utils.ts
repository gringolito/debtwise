import { createCn } from "cn/config";

/** Merges class names knowing the DESIGN.md scales, so `text-callout` overrides a size, not a color. */
export const cn = createCn({
  extend: {
    theme: {
      text: ["hero-figure", "large-title", "title-2", "headline", "body", "callout", "footnote"],
      shadow: ["sheet"],
      container: ["content"],
    },
  },
});
