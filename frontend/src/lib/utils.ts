import { createCn } from "cn/config";

/** Merges class names knowing the DESIGN.md scales, so `text-callout` overrides a size, not a color. */
export const cn = createCn({
  extend: {
    theme: {
      text: [
        "hero-figure",
        "page-title",
        "large-title",
        "title-2",
        "headline",
        "body",
        "callout",
        "footnote",
        "caption",
      ],
      shadow: ["sheet"],
      radius: ["sheet"],
      container: ["content", "three-figures"],
    },
  },
});
